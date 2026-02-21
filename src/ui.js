/**
 * UI 组件
 */

import { storage } from './storage.js';
import { aiService } from './ai-service.js';

// 格式化时间
function formatTime(timestamp) {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

// 渲染单个帖子
export function renderPost(post) {
  const timeStr = formatTime(post.createdAt);
  
  const tagsHtml = post.tags?.length
    ? `<div class="circle-post-tags">${post.tags.map(tag => 
        `<span class="circle-tag">#${tag}</span>`
      ).join('')}</div>`
    : '';
  
  const commentsHtml = post.comments?.length
    ? `<div class="circle-comments">
        ${post.comments.map(c => `
          <div class="circle-comment">
            <span class="comment-author">${c.authorName}:</span>
            <span class="comment-content">${c.content}</span>
          </div>
        `).join('')}
       </div>`
    : '';
  
  return `
    <div class="circle-post" data-post-id="${post.id}">
      <div class="circle-post-header">
        <div class="circle-avatar">👤</div>
        <div class="circle-post-meta">
          <div class="circle-author">${post.authorName}</div>
          <div class="circle-time">${timeStr}</div>
        </div>
      </div>
      <div class="circle-post-content">${post.content}</div>
      ${tagsHtml}
      <div class="circle-post-stats">
        <span>👁️ ${post.stats?.views || 0}</span>
        <span>❤️ ${post.stats?.likes || 0}</span>
        <span>💬 ${post.stats?.comments || 0}</span>
      </div>
      ${commentsHtml}
    </div>
  `;
}

// 渲染帖子列表
export async function renderPosts(container) {
  const { posts } = await storage.getPosts({ limit: 20 });
  
  if (posts.length === 0) {
    container.innerHTML = `
      <div class="circle-empty">
        <div class="circle-empty-icon">🌊</div>
        <p>圈子里还没有帖子</p>
        <p class="circle-empty-hint">角色们会自主发帖的，稍后再来看看吧~</p>
      </div>
    `;
  } else {
    container.innerHTML = posts.map(post => renderPost(post)).join('');
  }
  
  return posts.length;
}

// 显示测试对话框
export function showTestDialog(contentContainer, footerContainer, onComplete) {
  const characters = aiService.getCharacters();
  if (!characters || characters.length === 0) {
    alert('没有找到角色！请先创建角色。');
    return;
  }
  
  // 检查是否已有对话框
  if (document.getElementById('circle-test-dialog')) {
    return;
  }
  
  // 创建遮罩层
  const backdrop = document.createElement('div');
  backdrop.id = 'circle-test-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(4px);
    z-index: 100000;
  `;
  
  // 创建对话框
  const dialog = document.createElement('div');
  dialog.id = 'circle-test-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(40,40,45,0.98);
    border: 1px solid rgba(255,107,107,0.5);
    border-radius: 16px;
    padding: 24px;
    z-index: 100001;
    min-width: 320px;
    max-width: 90vw;
    box-shadow: 0 25px 80px rgba(0,0,0,0.8);
    color: white;
  `;
  
  const charOptions = characters.map((c, i) => 
    `<option value="${i}">${c.name}</option>`
  ).join('');
  
  dialog.innerHTML = `
    <h3 style="margin: 0 0 20px 0; color: #ff6b6b; font-size: 18px;">🧪 测试发帖</h3>
    <p style="margin: 0 0 12px 0; font-size: 14px; opacity: 0.9;">选择要发帖的角色：</p>
    <select id="test-char-select" style="
      width: 100%;
      padding: 12px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      color: white;
      font-size: 14px;
      margin-bottom: 20px;
      outline: none;
    ">${charOptions}</select>
    <div style="display: flex; gap: 12px;">
      <button id="test-confirm" style="
        flex: 1;
        background: linear-gradient(135deg, #ff6b6b, #ff8e8e);
        border: none;
        color: white;
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        transition: all 0.2s;
      ">开始生成</button>
      <button id="test-cancel" style="
        flex: 1;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      ">取消</button>
    </div>
    <div id="test-status" style="margin-top: 16px; padding: 10px; font-size: 13px; border-radius: 6px; display: none;"></div>
  `;
  
  document.body.appendChild(backdrop);
  document.body.appendChild(dialog);
  
  // 绑定事件
  backdrop.addEventListener('click', closeDialog);
  dialog.querySelector('#test-cancel').addEventListener('click', closeDialog);
  
  dialog.querySelector('#test-confirm').addEventListener('click', async () => {
    const select = dialog.querySelector('#test-char-select');
    const charIndex = select.value;
    const character = characters[charIndex];
    const statusDiv = dialog.querySelector('#test-status');
    
    // 禁用按钮
    dialog.querySelector('#test-confirm').disabled = true;
    dialog.querySelector('#test-cancel').disabled = true;
    
    statusDiv.style.display = 'block';
    statusDiv.style.background = 'rgba(255,193,7,0.15)';
    statusDiv.style.color = '#ffc107';
    statusDiv.style.border = '1px solid rgba(255,193,7,0.3)';
    statusDiv.textContent = `⏳ ${character.name} 正在构思内容...`;
    
    try {
      // 调用 AI 生成
      const post = await aiService.generatePostForCharacter(character);
      
      if (post) {
        // 保存帖子
        await storage.savePost(post);
        
        statusDiv.style.background = 'rgba(76,175,80,0.15)';
        statusDiv.style.color = '#4caf50';
        statusDiv.style.border = '1px solid rgba(76,175,80,0.3)';
        statusDiv.textContent = `✅ ${character.name} 发帖成功！`;
        
        setTimeout(() => {
          closeDialog();
          if (onComplete) onComplete();
        }, 1200);
      } else {
        throw new Error('生成失败，请检查 API 配置');
      }
    } catch (error) {
      statusDiv.style.background = 'rgba(244,67,54,0.15)';
      statusDiv.style.color = '#f44336';
      statusDiv.style.border = '1px solid rgba(244,67,54,0.3)';
      statusDiv.textContent = `❌ 错误: ${error.message}`;
      
      // 恢复按钮
      dialog.querySelector('#test-confirm').disabled = false;
      dialog.querySelector('#test-cancel').disabled = false;
    }
  });
  
  function closeDialog() {
    backdrop.remove();
    dialog.remove();
  }
}
