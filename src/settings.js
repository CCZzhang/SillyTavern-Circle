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
  await addSettingsPanel();
  
  console.log('[Circle] Settings initialized:', currentSettings);
}

/**
 * 添加设置面板到扩展快速设置面板
 */
async function addSettingsPanel() {
  // 等待 SillyTavern 上下文可用
  const context = window.SillyTavern?.getContext?.();
  if (!context?.renderExtensionTemplateAsync) {
    setTimeout(addSettingsPanel, 500);
    return;
  }
  
  try {
    // 查找或创建容器
    let container = document.getElementById('circle_container');
    if (!container) {
      const parent = document.getElementById('extensions_settings') || 
                     document.getElementById('extensions_settings2');
      if (!parent) {
        console.warn('[Circle] Parent container not found, retrying...');
        setTimeout(addSettingsPanel, 500);
        return;
      }
      
      container = document.createElement('div');
      container.id = 'circle_container';
      container.className = 'extension_container';
      parent.appendChild(container);
    }
    
    // 检查是否已添加
    if (container.querySelector('#circle_settings')) return;
    
    // 加载模板 - 使用相对路径
    const response = await fetch('/scripts/extensions/third-party/Circle/templates/settings.html');
    if (!response.ok) throw new Error('Failed to load settings template');
    
    let html = await response.text();
    
    // 替换默认值为当前设置
    html = html.replace('value="5"', `value="${currentSettings.autoPostInterval}"`);
    html = html.replace('value="30"', `value="${currentSettings.autoPostProbability}"`);
    html = html.replace('checked />', `checked />`).replace(/checked=""/g, '');
    
    // 更新复选框状态
    if (!currentSettings.enabled) {
      html = html.replace('id="circle-setting-enabled" type="checkbox" checked', 'id="circle-setting-enabled" type="checkbox"');
    }
    if (!currentSettings.enableCharacterComments) {
      html = html.replace('id="circle-setting-comments" type="checkbox" checked', 'id="circle-setting-comments" type="checkbox"');
    }
    if (currentSettings.debugMode) {
      html = html.replace('id="circle-setting-debug" type="checkbox"', 'id="circle-setting-debug" type="checkbox" checked');
    }
    
    container.innerHTML = html;
    
    // 绑定事件
    bindSettingsEvents();
    
    // 加载统计
    loadStats();
    
    console.log('[Circle] Settings panel added');
  } catch (error) {
    console.error('[Circle] Failed to add settings panel:', error);
  }
}

/**
 * 绑定设置事件
 */
function bindSettingsEvents() {
  // 间隔滑块
  const intervalSlider = document.getElementById('circle-setting-interval');
  const intervalValue = document.getElementById('circle-interval-value');
  if (intervalSlider && intervalValue) {
    intervalSlider.value = currentSettings.autoPostInterval;
    intervalValue.textContent = intervalSlider.value;
    intervalSlider.addEventListener('input', () => {
      intervalValue.textContent = intervalSlider.value;
    });
  }
  
  // 概率滑块
  const probSlider = document.getElementById('circle-setting-probability');
  const probValue = document.getElementById('circle-probability-value');
  if (probSlider && probValue) {
    probSlider.value = currentSettings.autoPostProbability;
    probValue.textContent = probSlider.value;
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
  if (btn) {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i><span>已保存</span>';
    btn.style.background = '#4ade80';
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 1500);
  }
  
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
  
  const intervalSlider = document.getElementById('circle-setting-interval');
  const intervalValue = document.getElementById('circle-interval-value');
  if (intervalSlider) intervalSlider.value = currentSettings.autoPostInterval;
  if (intervalValue) intervalValue.textContent = currentSettings.autoPostInterval;
  
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
    
    statsEl.textContent = postCount;
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
