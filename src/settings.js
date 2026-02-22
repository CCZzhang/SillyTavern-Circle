/**
 * Circle - Settings Panel
 * 扩展设置面板管理
 */

import { storage } from './storage.js';

// 默认设置
const DEFAULT_SETTINGS = {
  enabled: true,
  autoPostInterval: 5, // 分钟
  autoPostProbability: 30, // 百分比
  maxPostsPerDay: 10,
  enableCharacterComments: true,
  debugMode: false
};

// 当前设置
let currentSettings = { ...DEFAULT_SETTINGS };

/**
 * 初始化设置
 */
export async function initSettings() {
  // 从 storage 加载设置
  const saved = await storage.getSettings?.();
  if (saved) {
    currentSettings = { ...DEFAULT_SETTINGS, ...saved };
  }
  
  // 添加设置面板
  addSettingsPanel();
  
  console.log('[Circle] Settings initialized:', currentSettings);
}

/**
 * 添加设置面板到扩展管理器
 */
function addSettingsPanel() {
  // 等待扩展管理器加载完成
  const checkInterval = setInterval(() => {
    const extensionBlock = document.querySelector('.extension_block[data-name="Circle"]') || 
                           document.querySelector('.extension_block[data-name="third-party/Circle"]');
    
    if (!extensionBlock) return;
    
    clearInterval(checkInterval);
    
    // 检查是否已添加设置面板
    if (extensionBlock.querySelector('.circle-settings')) return;
    
    // 创建设置面板 HTML
    const settingsHtml = `
      <div class="circle-settings" style="
        margin-top: 10px;
        padding: 15px;
        background: rgba(255,107,107,0.05);
        border: 1px solid rgba(255,107,107,0.2);
        border-radius: 8px;
        font-size: 13px;
      ">
        <div style="font-weight: 600; color: #ff6b6b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span>⚙️</span> Circle 设置
        </div>
        
        <!-- 自动发帖开关 -->
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <label style="cursor: pointer;">自动发帖</label>
          <input type="checkbox" id="circle-setting-enabled" ${currentSettings.enabled ? 'checked' : ''} 
            style="cursor: pointer; width: 18px; height: 18px;">
        </div>
        
        <!-- 发帖间隔 -->
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">最小间隔（分钟）</label>
          <input type="number" id="circle-setting-interval" value="${currentSettings.autoPostInterval}" min="1" max="60"
            style="width: 60px; padding: 4px 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: inherit;">
        </div>
        
        <!-- 发帖概率 -->
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">触发概率（%）</label>
          <input type="range" id="circle-setting-probability" value="${currentSettings.autoPostProbability}" min="0" max="100"
            style="width: 100%; cursor: pointer;">
          <div style="text-align: center; margin-top: 2px; opacity: 0.8;">
            <span id="circle-probability-value">${currentSettings.autoPostProbability}</span>%
          </div>
        </div>
        
        <!-- 角色互动 -->
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <label style="cursor: pointer;">角色间互动</label>
          <input type="checkbox" id="circle-setting-comments" ${currentSettings.enableCharacterComments ? 'checked' : ''}
            style="cursor: pointer; width: 18px; height: 18px;">
        </div>
        
        <!-- 调试模式 -->
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <label style="cursor: pointer;">调试模式</label>
          <input type="checkbox" id="circle-setting-debug" ${currentSettings.debugMode ? 'checked' : ''}
            style="cursor: pointer; width: 18px; height: 18px;">
        </div>
        
        <!-- 按钮组 -->
        <div style="display: flex; gap: 8px; margin-top: 15px;">
          <button id="circle-save-settings" style="
            flex: 1;
            background: linear-gradient(135deg, #ff6b6b, #ff8e8e);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
          ">保存</button>
          <button id="circle-reset-settings" style="
            flex: 1;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: inherit;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
          ">重置</button>
        </div>
        
        <!-- 统计信息 -->
        <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; opacity: 0.8;">
          <div>📊 统计：<span id="circle-stats">加载中...</span></div>
        </div>
      </div>
    `;
    
    // 插入到扩展块中
    const actionsDiv = extensionBlock.querySelector('.extension_actions');
    if (actionsDiv) {
      actionsDiv.insertAdjacentHTML('afterend', settingsHtml);
    } else {
      extensionBlock.insertAdjacentHTML('beforeend', settingsHtml);
    }
    
    // 绑定事件
    bindSettingsEvents();
    
    // 加载统计
    loadStats();
    
  }, 1000);
}

/**
 * 绑定设置事件
 */
function bindSettingsEvents() {
  // 概率滑块实时更新
  const probSlider = document.getElementById('circle-setting-probability');
  const probValue = document.getElementById('circle-probability-value');
  if (probSlider && probValue) {
    probSlider.addEventListener('input', () => {
      probValue.textContent = probSlider.value;
    });
  }
  
  // 保存按钮
  const saveBtn = document.getElementById('circle-save-settings');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }
  
  // 重置按钮
  const resetBtn = document.getElementById('circle-reset-settings');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('确定要重置所有设置吗？')) {
        resetSettings();
      }
    });
  }
}

/**
 * 保存设置
 */
async function saveSettings() {
  const newSettings = {
    enabled: document.getElementById('circle-setting-enabled')?.checked ?? true,
    autoPostInterval: parseInt(document.getElementById('circle-setting-interval')?.value) || 5,
    autoPostProbability: parseInt(document.getElementById('circle-setting-probability')?.value) || 30,
    enableCharacterComments: document.getElementById('circle-setting-comments')?.checked ?? true,
    debugMode: document.getElementById('circle-setting-debug')?.checked ?? false
  };
  
  currentSettings = newSettings;
  
  // 保存到 storage
  await storage.saveSettings?.(newSettings);
  
  // 更新 AI 服务设置
  updateAIServiceSettings(newSettings);
  
  // 显示提示
  const btn = document.getElementById('circle-save-settings');
  const originalText = btn.textContent;
  btn.textContent = '✓ 已保存';
  btn.style.background = '#4ade80';
  
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 1500);
  
  console.log('[Circle] Settings saved:', newSettings);
}

/**
 * 重置设置
 */
async function resetSettings() {
  currentSettings = { ...DEFAULT_SETTINGS };
  
  // 更新 UI
  const enabledCheckbox = document.getElementById('circle-setting-enabled');
  if (enabledCheckbox) enabledCheckbox.checked = currentSettings.enabled;
  
  const intervalInput = document.getElementById('circle-setting-interval');
  if (intervalInput) intervalInput.value = currentSettings.autoPostInterval;
  
  const probSlider = document.getElementById('circle-setting-probability');
  const probValue = document.getElementById('circle-probability-value');
  if (probSlider) probSlider.value = currentSettings.autoPostProbability;
  if (probValue) probValue.textContent = currentSettings.autoPostProbability;
  
  const commentsCheckbox = document.getElementById('circle-setting-comments');
  if (commentsCheckbox) commentsCheckbox.checked = currentSettings.enableCharacterComments;
  
  const debugCheckbox = document.getElementById('circle-setting-debug');
  if (debugCheckbox) debugCheckbox.checked = currentSettings.debugMode;
  
  // 保存
  await storage.saveSettings?.(currentSettings);
  updateAIServiceSettings(currentSettings);
  
  console.log('[Circle] Settings reset to defaults');
}

/**
 * 更新 AI 服务设置
 */
function updateAIServiceSettings(settings) {
  // 触发自定义事件通知 ai-service
  window.dispatchEvent(new CustomEvent('circle:settings_changed', { 
    detail: settings 
  }));
}

/**
 * 加载统计信息
 */
async function loadStats() {
  try {
    const statsEl = document.getElementById('circle-stats');
    if (!statsEl) return;
    
    const { posts } = await storage.getPosts({ limit: 1000 });
    const postCount = posts?.length || 0;
    
    statsEl.innerHTML = `${postCount} 条帖子`;
  } catch (e) {
    console.error('[Circle] Failed to load stats:', e);
  }
}

/**
 * 获取当前设置
 */
export function getSettings() {
  return { ...currentSettings };
}
