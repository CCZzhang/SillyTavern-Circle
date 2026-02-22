/**
 * Circle - Storage
 * 使用 IndexedDB 存储帖子、评论、聊天总结
 */

const DB_NAME = 'circle-extension-v2';
const DB_VERSION = 1;

class Storage {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[Circle] DB open error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[Circle] DB opened:', DB_NAME);
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Posts store
        if (!db.objectStoreNames.contains('posts')) {
          const postStore = db.createObjectStore('posts', { keyPath: 'id', autoIncrement: true });
          postStore.createIndex('authorName', 'authorName', { unique: false });
          postStore.createIndex('createdAt', 'createdAt', { unique: false });
          postStore.createIndex('isAI', 'isAI', { unique: false });
        } else if (oldVersion > 0) {
          // 已存在，检查/添加索引
          const postStore = request.transaction.objectStore('posts');
          if (!postStore.indexNames.contains('authorName')) {
            postStore.createIndex('authorName', 'authorName', { unique: false });
          }
          if (!postStore.indexNames.contains('createdAt')) {
            postStore.createIndex('createdAt', 'createdAt', { unique: false });
          }
          if (!postStore.indexNames.contains('isAI')) {
            postStore.createIndex('isAI', 'isAI', { unique: false });
          }
        }

        // Chat summaries
        if (!db.objectStoreNames.contains('chatSummaries')) {
          const summaryStore = db.createObjectStore('chatSummaries', { keyPath: 'characterName' });
          summaryStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Raw chat messages
        if (!db.objectStoreNames.contains('chatMessages')) {
          const msgStore = db.createObjectStore('chatMessages', { keyPath: 'id', autoIncrement: true });
          msgStore.createIndex('characterName', 'characterName', { unique: false });
          msgStore.createIndex('timestamp', 'timestamp', { unique: false });
        } else if (oldVersion > 0) {
          // 检查/添加索引
          const msgStore = request.transaction.objectStore('chatMessages');
          if (!msgStore.indexNames.contains('characterName')) {
            msgStore.createIndex('characterName', 'characterName', { unique: false });
          }
          if (!msgStore.indexNames.contains('timestamp')) {
            msgStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        }
      };
    });
  }

  // ========== Posts ==========
  async getPosts({ limit = 50, offset = 0 } = {}) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('posts', 'readonly');
      const store = tx.objectStore('posts');
      
      // 检查索引是否存在
      let source = store;
      if (store.indexNames.contains('createdAt')) {
        source = store.index('createdAt');
      }
      
      const request = source.openCursor(null, 'prev');

      const posts = [];
      let skipped = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
            return;
          }
          if (posts.length < limit) {
            posts.push(cursor.value);
            cursor.continue();
            return;
          }
        }
        resolve({ posts, hasMore: cursor !== null });
      };

      request.onerror = () => resolve({ posts: [], hasMore: false });
    });
  }

  async savePost(post) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('posts', 'readwrite');
      const store = tx.objectStore('posts');

      // 检查 post 是否有 id，且 id 不是 undefined
      const hasValidId = Object.prototype.hasOwnProperty.call(post, 'id') && 
                         post.id !== undefined && 
                         post.id !== null;
      
      console.log('[Circle] savePost - hasValidId:', hasValidId, 'post.id:', post.id);

      // 构建干净的 data 对象
      const data = {
        authorName: post.authorName,
        authorAvatar: post.authorAvatar || '',
        content: post.content,
        tags: post.tags || [],
        createdAt: post.createdAt || Date.now(),
        updatedAt: Date.now(),
        isAI: post.isAI || false,
        stats: post.stats || { views: 0, likes: 0, comments: 0 },
        comments: post.comments || []
      };
      
      // 只有提供有效 id 时才添加
      if (hasValidId) {
        data.id = post.id;
        console.log('[Circle] savePost - using provided id:', post.id);
      } else {
        console.log('[Circle] savePost - auto-generating id');
      }

      // 使用 put (upsert)
      const request = store.put(data);
      request.onsuccess = () => {
        console.log('[Circle] savePost - success, id:', request.result);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('[Circle] savePost - error:', request.error);
        reject(request.error);
      };
    });
  }

  async getPost(id) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('posts', 'readonly');
      const store = tx.objectStore('posts');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  // ========== Chat Summaries ==========
  async getChatSummary(characterName) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('chatSummaries', 'readonly');
      const store = tx.objectStore('chatSummaries');
      const request = store.get(characterName);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async saveChatSummary(characterName, summary, messageCount) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('chatSummaries', 'readwrite');
      const store = tx.objectStore('chatSummaries');

      const data = {
        characterName,
        summary,
        messageCount,
        updatedAt: Date.now()
      };

      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ========== Raw Chat Messages ==========
  async saveRawMessages(characterName, messages) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('chatMessages', 'readwrite');
      const store = tx.objectStore('chatMessages');

      const timestamp = Date.now();
      const data = messages.map((msg, idx) => ({
        characterName,
        role: msg.role || (msg.name === 'You' || msg.is_user ? 'user' : 'assistant'),
        content: msg.content || msg.mes,
        timestamp: timestamp + idx
      }));

      let completed = 0;
      let errors = 0;

      for (const item of data) {
        const request = store.put(item);
        request.onsuccess = () => { completed++; if (completed + errors === data.length) resolve(completed); };
        request.onerror = () => { errors++; if (completed + errors === data.length) resolve(completed); };
      }

      if (data.length === 0) resolve(0);
    });
  }

  async getRawChatMessages(characterName, limit = 50) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('chatMessages', 'readonly');
      const store = tx.objectStore('chatMessages');
      
      // 检查索引是否存在
      let request;
      if (store.indexNames.contains('characterName')) {
        const index = store.index('characterName');
        const range = IDBKeyRange.only(characterName);
        request = index.openCursor(range);
      } else {
        // 如果没有索引，遍历所有记录
        request = store.openCursor();
      }

      const messages = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && messages.length < limit) {
          const value = cursor.value;
          // 如果使用了索引，所有结果都是该角色的；否则需要过滤
          if (store.indexNames.contains('characterName') || value.characterName === characterName) {
            messages.push(value);
          }
          cursor.continue();
        } else {
          resolve(messages);
        }
      };

      request.onerror = () => resolve([]);
    });
  }

  // ========== Sync ==========
  async syncNewMessages() {
    const context = window.SillyTavern?.getContext?.();
    if (!context) return;

    const characterName = context.name2;
    if (!characterName) return;

    try {
      const existingMessages = await this.getRawChatMessages(characterName, 1000);
      const lastTimestamp = existingMessages.length > 0
        ? Math.max(...existingMessages.map(m => m.timestamp))
        : 0;

      const chat = context.chat || [];
      const newMessages = chat
        .filter(m => m && (m.timestamp || Date.now()) > lastTimestamp)
        .map(m => ({
          characterName,
          role: m.is_user ? 'user' : 'assistant',
          content: m.mes || m.content || '',
          timestamp: m.timestamp || Date.now()
        }));

      if (newMessages.length > 0) {
        await this.saveRawMessages(characterName, newMessages);
        console.log(`[Circle] Synced ${newMessages.length} new messages for ${characterName}`);
      }

      return newMessages.length;
    } catch (error) {
      console.error('[Circle] Sync error:', error);
      return 0;
    }
  }

  // ========== Stats ==========
  async getStats() {
    const tx = this.db.transaction(['posts', 'chatSummaries', 'chatMessages'], 'readonly');

    const counts = await Promise.all([
      new Promise(r => {
        const store = tx.objectStore('posts');
        const req = store.count();
        req.onsuccess = () => r(req.result);
      }),
      new Promise(r => {
        const store = tx.objectStore('chatSummaries');
        const req = store.count();
        req.onsuccess = () => r(req.result);
      }),
      new Promise(r => {
        const store = tx.objectStore('chatMessages');
        const req = store.count();
        req.onsuccess = () => r(req.result);
      })
    ]);

    return {
      postCount: counts[0],
      summaryCount: counts[1],
      messageCount: counts[2]
    };
  }

  // ========== Settings ==========
  async saveSettings(settings) {
    return new Promise((resolve) => {
      try {
        localStorage.setItem('circle-extension-settings', JSON.stringify(settings));
        resolve(true);
      } catch (e) {
        console.error('[Circle] Failed to save settings:', e);
        resolve(false);
      }
    });
  }

  async getSettings() {
    return new Promise((resolve) => {
      try {
        const data = localStorage.getItem('circle-extension-settings');
        resolve(data ? JSON.parse(data) : null);
      } catch (e) {
        console.error('[Circle] Failed to get settings:', e);
        resolve(null);
      }
    });
  }
}

export const storage = new Storage();
