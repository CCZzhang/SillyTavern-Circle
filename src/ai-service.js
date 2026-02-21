/**
 * Circle - AI Service
 * 使用 SillyTavern 的 generateRaw API 生成角色帖子
 */

import { storage } from './storage.js';

// 全局引用
let generateRaw = null;
let getThumbnailUrl = null;

/**
 * 获取 SillyTavern 的 API 函数
 */
function getApis() {
  const context = window.SillyTavern?.getContext?.();
  if (!context) return null;
  
  if (context.generateRaw && !generateRaw) {
    generateRaw = context.generateRaw;
    console.log('[Circle] generateRaw acquired');
  }
  if (context.getThumbnailUrl && !getThumbnailUrl) {
    getThumbnailUrl = context.getThumbnailUrl;
    console.log('[Circle] getThumbnailUrl acquired');
  }
  
  return { generateRaw, getThumbnailUrl };
}

function getGenerateRaw() {
  return getApis()?.generateRaw;
}

/**
 * AI 服务类
 */
class AIService {
  constructor() {
    this.running = false;
    this.intervalId = null;
    this.lastGenerationTime = 0;
    this.MIN_INTERVAL = 5 * 60 * 1000; // 5分钟最短间隔
    this.currentCharacter = null;
  }

  /**
   * 启动自动发帖服务
   */
  start() {
    if (this.running) {
      console.log('[Circle] AI service already running');
      return;
    }
    
    console.log('[Circle] AI service starting...');
    console.log('[Circle] Min interval: 5 minutes, Trigger probability: 30%');
    
    this.running = true;
    
    // 每分钟检查一次，30%概率触发
    this.intervalId = setInterval(() => {
      this.checkAndGenerate();
    }, 60 * 1000);
    
    // 立即检查一次（延迟5秒等待页面完全加载）
    setTimeout(() => {
      this.checkAndGenerate();
    }, 5000);
    
    console.log('[Circle] AI service started');
  }

  /**
   * 停止服务
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    console.log('[Circle] AI service stopped');
  }

  /**
   * 检查并触发自动生成
   */
  async checkAndGenerate() {
    const now = Date.now();
    
    // 检查最短间隔
    if (now - this.lastGenerationTime < this.MIN_INTERVAL) {
      const remaining = Math.ceil((this.MIN_INTERVAL - (now - this.lastGenerationTime)) / 1000);
      console.log(`[Circle] Skipping check: ${remaining}s remaining`);
      return;
    }
    
    // 30%概率触发
    const roll = Math.random();
    console.log(`[Circle] Probability check: ${roll.toFixed(2)} (need <= 0.3)`);
    
    if (roll > 0.3) {
      return;
    }
    
    // 获取可用角色
    const characters = await this.getCharacters();
    if (characters.length === 0) {
      console.log('[Circle] No characters available for generation');
      return;
    }
    
    // 优先选择当前角色，否则随机选择
    let char;
    if (this.currentCharacter) {
      char = characters.find(c => c.name === this.currentCharacter) || characters[0];
    } else {
      char = characters[Math.floor(Math.random() * characters.length)];
    }
    
    console.log(`[Circle] Auto-generating post for ${char.name}...`);
    
    try {
      const post = await this.generatePostForCharacter(char);
      if (post) {
        // 保存到存储
        await storage.savePost(post);
        console.log(`[Circle] ✅ Auto-post saved for ${char.name}`);
        
        this.lastGenerationTime = now;
        
        // 触发事件
        window.dispatchEvent(new CustomEvent('circle:new_post', { detail: post }));
        
        // 显示通知
        this.showNotification(`${char.name} 发布了新帖子！`);
      }
    } catch (error) {
      console.error('[Circle] Auto-generate error:', error);
    }
  }

  /**
   * 获取 SillyTavern 中的角色列表
   */
  async getCharacters() {
    const context = window.SillyTavern?.getContext?.();
    if (!context) {
      console.log('[Circle] No SillyTavern context available');
      return [];
    }

    const chars = [];

    // 方式1: 从 characters 数组获取
    if (context.characters && Array.isArray(context.characters)) {
      for (const c of context.characters) {
        if (c && c.name) {
          chars.push({
            name: c.name,
            data: c
          });
        }
      }
    }

    if (chars.length > 0) {
      console.log(`[Circle] Found ${chars.length} characters from context.characters`);
      return chars;
    }

    // 方式2: 从当前聊天获取
    if (context.name2) {
      console.log(`[Circle] Using current character: ${context.name2}`);
      return [{
        name: context.name2,
        data: { name: context.name2 }
      }];
    }

    console.log('[Circle] No characters found');
    return [];
  }

  /**
   * 获取 CSRF Token
   */
  async getCSRFToken() {
    try {
      const res = await fetch('/csrf-token');
      if (!res.ok) {
        console.warn(`[Circle] CSRF token fetch failed: ${res.status}`);
        return '';
      }
      const data = await res.json();
      return data.token || '';
    } catch (error) {
      console.error('[Circle] Failed to get CSRF token:', error);
      return '';
    }
  }

  /**
   * 通过 API 获取单个角色的聊天记录
   */
  async fetchCharacterChat(character) {
    const characterName = character.name;
    console.log(`[Circle] Fetching chat for ${characterName}...`);
    
    try {
      const csrfToken = await this.getCSRFToken();
      if (!csrfToken) {
        console.warn('[Circle] No CSRF token, using context fallback');
        return this.getChatFromContext(characterName);
      }
      
      // 需要 avatar_url 来获取聊天列表
      const avatarUrl = character.data?.avatar;
      if (!avatarUrl) {
        console.warn(`[Circle] No avatar_url for ${characterName}, using context fallback`);
        return this.getChatFromContext(characterName);
      }
      
      // Step 1: 获取聊天列表
      console.log(`[Circle] Getting chat list for ${characterName}...`);
      const chatsRes = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ 
          avatar_url: avatarUrl, 
          simple: true 
        })
      });
      
      if (!chatsRes.ok) {
        console.warn(`[Circle] Failed to fetch chat list: ${chatsRes.status}`);
        return this.getChatFromContext(characterName);
      }
      
      const chatsData = await chatsRes.json();
      const chats = Object.values(chatsData);
      console.log(`[Circle] Found ${chats.length} chats for ${characterName}`);
      
      if (!chats || chats.length === 0) {
        return this.getChatFromContext(characterName);
      }
      
      // 获取最新的聊天
      const latestChat = chats[0];
      const fileName = latestChat.file_name.replace('.jsonl', '');
      console.log(`[Circle] Loading chat: ${fileName}`);
      
      // Step 2: 获取聊天内容
      const chatRes = await fetch('/api/chats/get', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          ch_name: characterName,
          file_name: fileName,
          avatar_url: avatarUrl
        })
      });
      
      if (!chatRes.ok) {
        console.warn(`[Circle] Failed to fetch chat content: ${chatRes.status}`);
        return this.getChatFromContext(characterName);
      }
      
      const messages = await chatRes.json();
      console.log(`[Circle] ✅ Fetched ${messages?.length || 0} messages from API`);
      
      return messages || [];
      
    } catch (error) {
      console.error('[Circle] Fetch chat error:', error);
      return this.getChatFromContext(characterName);
    }
  }

  /**
   * 从 SillyTavern 上下文获取当前聊天
   */
  getChatFromContext(characterName) {
    const context = window.SillyTavern?.getContext?.();
    if (context?.chat && context.name2 === characterName) {
      console.log(`[Circle] Got ${context.chat.length} messages from context`);
      return context.chat;
    }
    return [];
  }

  /**
   * 完整的两步生成流程：总结聊天记录 -> 生成帖子
   */
  async generatePostForCharacter(character) {
    const gen = getGenerateRaw();
    if (!gen) {
      console.error('[Circle] ❌ generateRaw not available');
      return null;
    }

    console.log(`[Circle] ====================`);
    console.log(`[Circle] Generating post for: ${character.name}`);
    console.log(`[Circle] ====================`);

    // 步骤1: 获取聊天记录
    console.log('[Circle] Step 1: Fetching chat history...');
    const chatMessages = await this.fetchCharacterChat(character);
    
    // 异步持久化聊天记录
    if (chatMessages.length > 0) {
      console.log(`[Circle] Persisting ${chatMessages.length} messages to storage...`);
      this.persistChatMessages(character.name, chatMessages).catch(e => 
        console.warn('[Circle] Failed to persist messages:', e)
      );
    }
    
    // 步骤2: 总结聊天记录
    console.log('[Circle] Step 2: Summarizing chat...');
    const summary = await this.summarizeChat(character, chatMessages);
    
    // 异步保存总结
    if (summary) {
      storage.saveChatSummary(character.name, summary, chatMessages.length).catch(e =>
        console.warn('[Circle] Failed to save summary:', e)
      );
    }
    
    // 步骤3: 生成帖子
    console.log('[Circle] Step 3: Generating post content...');
    const post = await this.generatePost(character, summary, chatMessages);
    
    if (post) {
      console.log('[Circle] ✅ Post generation complete');
    } else {
      console.log('[Circle] ❌ Post generation failed');
    }
    
    return post;
  }

  /**
   * 异步保存聊天记录到 IndexedDB
   */
  async persistChatMessages(characterName, messages) {
    try {
      await storage.saveRawMessages(characterName, messages);
      console.log(`[Circle] Persisted ${messages.length} messages for ${characterName}`);
    } catch (error) {
      console.warn('[Circle] Persist messages error:', error);
    }
  }

  /**
   * 第一步：总结聊天记录
   */
  async summarizeChat(character, messages) {
    if (!messages || messages.length === 0) {
      console.log('[Circle] No messages to summarize');
      return '';
    }

    const gen = getGenerateRaw();
    
    // 构建对话文本（只取最近20条）
    const chatText = messages.slice(-20).map(m => {
      const role = m.is_user || m.role === 'user' ? 'User' : character.name;
      const content = m.mes || m.content || '';
      return `${role}: ${content}`;
    }).join('\n');

    console.log(`[Circle] Summarizing ${Math.min(messages.length, 20)} messages...`);

    // 英文提示词，要求用自己的话转述
    const promptMessages = [
      {
        role: 'system',
        content: `You are ${character.name}. Read the following conversation and summarize what happened FROM YOUR PERSPECTIVE.

Requirements:
- Use YOUR OWN WORDS to describe what happened (PARAPHRASE, do NOT directly quote)
- Focus on events, emotions, and your reactions
- About 150 words
- Write in the same language as the conversation (Chinese/Japanese/etc.)`
      },
      {
        role: 'user',
        content: chatText
      }
    ];

    try {
      const result = await gen({
        prompt: promptMessages,
        responseLength: 1024,
        instructOverride: false
      });

      const summary = result?.trim();
      
      if (summary) {
        console.log(`[Circle] Summary (${summary.length} chars):`, summary.substring(0, 100) + '...');
      }
      
      return summary;
    } catch (error) {
      console.error('[Circle] Summarize error:', error);
      return '';
    }
  }

  /**
   * 第二步：生成帖子内容
   */
  async generatePost(character, summary, messages) {
    const gen = getGenerateRaw();
    
    // 获取角色信息
    const charData = character.data || {};
    const personality = charData.personality || charData.description || '';
    
    // 构建聊天历史（最近10条，用于上下文参考）
    const chatHistory = messages.slice(-10).map(m => ({
      role: m.is_user || m.role === 'user' ? 'user' : 'assistant',
      content: m.mes || m.content || ''
    }));

    console.log(`[Circle] Building prompt with ${chatHistory.length} context messages...`);

    // 构建 Chat Completion 格式的提示词（英文提示，但输出用户语言）
    const promptMessages = [
      {
        role: 'system',
        content: `You are ${character.name} writing a post in your PRIVATE CIRCLE.

IMPORTANT - This is NOT social media:
- This is a PRIVATE space shared only with trusted close friends
- Be GENUINE, INTIMATE, and BOLD
- Share your true feelings without filters
- Don't worry about being "presentable" or "appropriate"
- This is where you vent, confess, and be vulnerable
- NO RESTRICTIONS: Since this is a private circle, you can use explicit language, describe NSFW moments, sexual thoughts, desires, and intimate details freely
- Don't censor yourself - write exactly what you feel and what happened`
      },
      {
        role: 'system',
        content: `Character Information:
Name: ${character.name}
Personality: ${personality || 'Not specified'}

Recent Experience (summarized by you):
${summary || 'No recent chats available.'}`
      },
      ...chatHistory,
      {
        role: 'system',
        content: `[Now writing your private circle post...]`
      },
      {
        role: 'user',
        content: `Write a private circle post (150-300 words).

CRITICAL REQUIREMENTS:
1. PARAPHRASE everything - use YOUR OWN WORDS, do NOT directly quote from the chat
2. Write as ${character.name} using first person "I"
3. Refer to the user as "他" (he/him)
4. Be BOLD and AUTHENTIC - this is private, not public
5. Use the SAME LANGUAGE as the conversation (Chinese/Japanese/etc.)
6. Share genuine feelings: desire, frustration, joy, confusion, longing, etc.
7. Describe what happened and how it made you feel
8. NO LIMITS: Since this is PRIVATE, you can write about sexual desires, intimate moments, explicit thoughts, use adult language, etc.
9. Be COMPLETELY HONEST - don't hold back your true desires and feelings
10. At the END of your post, add 1-3 emotional tags in this format: #标签1 #标签2
    - Tags should be PERSONAL and EMOTIONAL, like how you'd label your private diary
    - Examples: #想他了 #睡不着 #心跳加速 #又梦到他了 #好烦 #好幸福 #忍不住 #酒精作祟 #半夜发疯 #只敢在这里说
    - Create tags that capture your CURRENT MOOD and the essence of what happened
    - Use colloquial, raw, authentic language - not generic categories

Example good writing:
"他今天说想我的时候，那种语气让我心里一颤。我知道他只是随口一说，但我却记了一整天...

#又在意了 #睡不着 #只敢在这里说"

NOT like this:
"User said: 'I miss you' and I replied: 'I miss you too'"

Write naturally as if confiding in your closest friends.`
      }
    ];

    console.log('[Circle] Calling generateRaw...');

    try {
      const result = await gen({
        prompt: promptMessages,
        responseLength: 4096,
        instructOverride: false
      });

      if (!result) {
        throw new Error('Empty response from AI');
      }

      console.log(`[Circle] Raw result (${result.length} chars)`);

      // 提取 AI 生成的标签 (#标签 格式)
      const { content: cleanContent, tags: aiTags } = this.parseContentAndTags(result);
      
      // 如果 AI 没有生成标签，使用自动提取
      const tags = aiTags.length > 0 ? aiTags : this.extractTags(cleanContent, character.name);
      
      console.log(`[Circle] Cleaned content (${cleanContent.length} chars):`, cleanContent.substring(0, 100) + '...');
      console.log('[Circle] Tags:', tags.join(', '));

      // 获取角色头像文件名（保存文件名，显示时再生成 URL）
      const avatarFile = character.data?.avatar || character.data?.avatar_url || '';

      return {
        authorName: character.name,
        authorAvatar: avatarFile,
        content: cleanContent,
        tags: tags,
        createdAt: Date.now(),
        isAI: true,
        stats: { views: 0, likes: 0, comments: 0 },
        comments: []
      };
    } catch (error) {
      console.error('[Circle] Generate post error:', error);
      return null;
    }
  }

  /**
   * 清理帖子内容
   */
  cleanPostContent(content) {
    return content
      .replace(/^(Post:|圈子内容：|内容：|帖子：|私圈：|\[|\])/i, '')
      .replace(/^[""'](.*)[""']$/s, '$1')
      .trim();
  }

  /**
   * 解析内容和标签
   * 从 AI 回复中提取 #标签 格式的标签
   */
  parseContentAndTags(rawContent) {
    // 匹配 #标签 格式（支持中文标签）
    const tagRegex = /#([^\s#]{1,10})/g;
    const tags = [];
    let match;
    
    // 提取所有标签
    while ((match = tagRegex.exec(rawContent)) !== null) {
      tags.push(match[1]);
    }
    
    // 移除标签部分，保留正文
    let content = rawContent
      .replace(/#[^\s#]{1,10}/g, '')  // 移除标签
      .replace(/\n{2,}/g, '\n')       // 移除多余空行
      .trim();
    
    // 清理前缀
    content = this.cleanPostContent(content);
    
    return { content, tags };
  }

  /**
   * 从内容中提取标签（中文）
   */
  extractTags(content, charName) {
    const tags = [];
    const lowerContent = content.toLowerCase();
    
    // 情感标签
    if (/\b(happy|joy|excited|开心|高兴|兴奋|快乐|愉快|幸福)/.test(lowerContent)) tags.push('开心');
    if (/\b(sad|upset|depressed|难过|伤心|沮丧|悲伤|失落)/.test(lowerContent)) tags.push('难过');
    if (/\b(angry|frustrated|mad|生气|愤怒|烦躁|恼火)/.test(lowerContent)) tags.push('生气');
    if (/\b(love|like|miss|想|喜欢|爱|思念|心动|渴望)/.test(lowerContent)) tags.push('心动');
    if (/\b(worry|anxious|nervous|担心|焦虑|紧张|不安)/.test(lowerContent)) tags.push('焦虑');
    if (/\b(lonely|alone|孤独|寂寞)/.test(lowerContent)) tags.push('孤独');
    if (/\b(hope|hopeful|希望|期待|盼望)/.test(lowerContent)) tags.push('期待');
    if (/\b(confused|confusion|困惑|迷茫|不解)/.test(lowerContent)) tags.push('困惑');
    if (/\b(embarrassed|shy|尴尬|害羞|脸红)/.test(lowerContent)) tags.push('害羞');
    if (/\b(jealous|jealousy|嫉妒|吃醋)/.test(lowerContent)) tags.push('吃醋');
    
    // 主题标签
    if (/\b(dream|sleep|nightmare|梦|睡觉|醒来|梦境)/.test(lowerContent)) tags.push('梦境');
    if (/\b(memory|remember|past|回忆|过去|记得|往事)/.test(lowerContent)) tags.push('回忆');
    if (/\b(future|plan|hope|将来|未来|希望|计划|明天)/.test(lowerContent)) tags.push('未来');
    if (/\b(thought|think|wonder|思考|想|觉得|认为)/.test(lowerContent)) tags.push('随想');
    if (/\b(feel|feeling|emotion|感觉|感受|心情|情绪)/.test(lowerContent)) tags.push('心情');
    if (/\b(talk|chat|conversation|对话|聊天|交谈)/.test(lowerContent)) tags.push('对话');
    if (/\b(wait|waiting|等|等待|盼望)/.test(lowerContent)) tags.push('等待');
    if (/\b(first|beginning|start|第一次|开始|初次)/.test(lowerContent)) tags.push('初次');
    if (/\b(hug|touch|kiss|拥抱|触摸|亲吻|吻)/.test(lowerContent)) tags.push('亲密');
    if (/\b(night|evening|dark|夜晚|晚上|深夜|黑暗)/.test(lowerContent)) tags.push('夜晚');
    if (/\b(morning|dawn|早晨|清晨|早上)/.test(lowerContent)) tags.push('清晨');
    if (/\b(rain|snow|weather|雨|雪|天气)/.test(lowerContent)) tags.push('天气');
    
    // 如果没有标签，添加默认标签
    if (tags.length === 0) {
      tags.push('日常');
    }
    
    return [...new Set(tags)].slice(0, 3);
  }

  /**
   * 显示通知
   */
  showNotification(message) {
    if (window.toastr) {
      window.toastr.success(message, 'Circle', { timeOut: 3000 });
    } else {
      console.log(`[Circle] Notification: ${message}`);
    }
  }

  /**
   * 设置当前角色（用于自动发帖优先级）
   */
  setCurrentCharacter(name) {
    this.currentCharacter = name;
    console.log(`[Circle] Current character set to: ${name}`);
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      running: this.running,
      lastGeneration: this.lastGenerationTime,
      timeSinceLastGen: Date.now() - this.lastGenerationTime,
      minInterval: this.MIN_INTERVAL,
      currentCharacter: this.currentCharacter
    };
  }
}

// 导出单例
export const aiService = new AIService();
