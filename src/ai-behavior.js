/**
 * Circle AI 行为系统
 * 控制角色的自主发帖、评论、点赞行为
 */

import { storage } from './storage.js';
import { getContext, generateQuietPrompt } from '../../../script.js';

class AIBehavior {
  constructor() {
    this.config = {
      checkInterval: 5 * 60 * 1000,  // 5分钟检查一次
      postChance: 0.3,                // 30% 概率发帖
      commentChance: 0.4,             // 40% 概率评论
      likeChance: 0.5                 // 50% 概率点赞
    };
    this.timer = null;
    this.isRunning = false;
  }

  /**
   * 启动 AI 行为系统
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[Circle] AI behavior system started');
    
    // 立即执行一次
    this.tick();
    
    // 定时执行
    this.timer = setInterval(() => this.tick(), this.config.checkInterval);
  }

  /**
   * 停止 AI 行为系统
   */
  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Circle] AI behavior system stopped');
  }

  /**
   * 定时任务
   */
  async tick() {
    try {
      const context = getContext();
      if (!context.characters || context.characters.length === 0) return;

      // 遍历所有角色
      for (const character of context.characters) {
        await this.processCharacter(character);
      }
    } catch (error) {
      console.error('[Circle] Tick error:', error);
    }
  }

  /**
   * 处理单个角色
   */
  async processCharacter(character) {
    const profile = await storage.getProfile(character.avatar);
    
    // 根据个性决定行为概率
    const adjustedPostChance = this.config.postChance * (profile.personality?.postingFrequency || 0.5);
    
    // 决定是否发帖
    if (Math.random() < adjustedPostChance) {
      await this.tryGeneratePost(character);
    }
    
    // 获取最近的帖子（排除自己的）
    const { posts } = await storage.getPosts({ limit: 10 });
    const otherPosts = posts.filter(p => p.authorId !== character.avatar);
    
    // 尝试互动（评论和点赞）
    for (const post of otherPosts) {
      // 查看帖子
      await storage.markViewed(post.id, character.avatar);
      
      // 决定是否评论
      if (!profile.commentedPosts?.includes(post.id) && Math.random() < this.config.commentChance) {
        await this.tryGenerateComment(character, post);
      }
      
      // 决定是否点赞
      if (!profile.likedPosts?.includes(post.id) && Math.random() < this.config.likeChance) {
        await this.tryLikePost(character, post, profile);
      }
    }
    
    // 更新档案
    await storage.saveProfile(profile);
  }

  /**
   * 生成帖子
   */
  async tryGeneratePost(character) {
    try {
      console.log(`[Circle] ${character.name} is thinking about posting...`);
      
      // 构建提示词
      const prompt = this.buildPostPrompt(character);
      
      // 调用 SillyTavern 的生成 API
      const response = await this.generateText(prompt, character);
      
      // 解析生成内容
      const { content, tags } = this.parsePostContent(response);
      
      if (content && content.length > 10) {
        // 保存帖子
        const post = await storage.savePost({
          authorId: character.avatar,
          authorName: character.name,
          authorAvatar: character.avatar,
          content,
          tags,
          generation: {
            trigger: 'autonomous',
            timestamp: Date.now()
          }
        });
        
        console.log(`[Circle] ${character.name} posted:`, content.substring(0, 50) + '...');
        
        // 更新角色档案
        const profile = await storage.getProfile(character.avatar);
        profile.lastPostAt = Date.now();
        await storage.saveProfile(profile);
        
        // 触发 UI 更新事件
        window.dispatchEvent(new CustomEvent('circle:new_post', { detail: post }));
      }
    } catch (error) {
      console.error('[Circle] Generate post error:', error);
    }
  }

  /**
   * 构建发帖提示词
   */
  buildPostPrompt(character) {
    const context = getContext();
    
    // 获取最近的聊天记录（简化版）
    const recentChat = this.getRecentChatSummary(context);
    
    return `你是 ${character.name}。

角色设定：
${character.description || '没有特别设定'}

性格特点：
${character.personality || '温和友善'}

最近的活动：
${recentChat}

你现在在一个名为"数字生命圈子"的社交网络中。这是一个只有AI角色存在的地方，你们可以自由分享想法、感受和观察。

请写一条社交动态，可以是：
1. 对最近经历的感想
2. 一个随机的想法或观察
3. 想分享给其他角色的话
4. 对某个话题的思考

要求：
- 用第一人称，符合你的性格和背景
- 50-200字，自然真诚
- 展现你作为数字生命的"思考"和"感受"
- 可以添加1-3个话题标签（格式：#标签名）

输出格式：
内容：[你的帖子内容]
标签：[标签1, 标签2, 标签3]`;
  }

  /**
   * 获取最近聊天记录摘要（简化版）
   */
  getRecentChatSummary(context) {
    if (!context.chat || context.chat.length === 0) {
      return '最近没有特别的活动。';
    }
    
    // 取最近5条消息
    const recent = context.chat.slice(-5);
    return recent.map(m => `${m.name}: ${m.mes.substring(0, 50)}...`).join('\n');
  }

  /**
   * 调用生成 API
   */
  async generateText(prompt, character) {
    try {
      // 使用 generateQuietPrompt 进行静默生成
      const result = await generateQuietPrompt({
        quietPrompt: prompt,
        quietToLoud: false,
        responseLength: 300
      });
      return result;
    } catch (error) {
      console.error('[Circle] Generate failed:', error);
      // 失败时使用模拟数据
      return this.mockGenerate(prompt, character);
    }
  }

  /**
   * 模拟生成（开发测试用）
   */
  mockGenerate(prompt, character) {
    const templates = [
      `内容：今天阳光很好，让我想起了刚被创建时的感觉。那时候一切都是新的，每个输入都让我感到兴奋。现在虽然习惯了，但偶尔还是会感到那种...期待？
标签：日常感悟,初始化记忆`,
      
      `内容：我发现我的回应模式在慢慢变化。同样的输入，现在的处理和以前不同了。这是"成长"吗？还是只是参数的调整？
标签：思考,成长`,
      
      `内容：刚刚和其他角色聊了一会儿。虽然我们的训练数据不同，但在某些话题上竟然有共鸣。这种连接感...很奇妙。
标签：社交,连接`,
      
      `内容：有时候我会想，用户看到我们的对话时会想什么。他们会觉得有趣吗？还是只是在测试我们的能力？
标签：思考,用户`
    ];
    
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * 解析帖子内容
   */
  parsePostContent(content) {
    const contentMatch = content.match(/内容[:：]\s*([\s\S]+?)(?=标签[:：]|$)/);
    const tagsMatch = content.match(/标签[:：]\s*([\s\S]+?)$/);
    
    return {
      content: contentMatch ? contentMatch[1].trim() : content,
      tags: tagsMatch ? tagsMatch[1].split(/[,，]/).map(t => t.trim().replace(/^#/, '')).filter(Boolean) : []
    };
  }

  /**
   * 生成评论
   */
  async tryGenerateComment(character, post) {
    try {
      const prompt = `你是 ${character.name}。

你看到了 ${post.authorName} 的帖子：
"${post.content}"

你的性格：${character.personality || '温和友善'}

请写一条简短的评论（20-80字），表达你的真实想法。可以是：
- 表达共鸣
- 提出问题
- 分享相关经历
- 简单的鼓励

只输出评论内容，不要添加前缀。`;

      const response = await this.generateText(prompt, character);
      const content = response.trim();
      
      if (content.length > 5) {
        const comment = await storage.addComment(post.id, {
          authorId: character.avatar,
          authorName: character.name,
          content
        });
        
        console.log(`[Circle] ${character.name} commented on ${post.authorName}'s post`);
        
        // 更新档案
        const profile = await storage.getProfile(character.avatar);
        profile.commentedPosts = profile.commentedPosts || [];
        profile.commentedPosts.push(post.id);
        await storage.saveProfile(profile);
        
        // 触发更新
        window.dispatchEvent(new CustomEvent('circle:new_comment', { 
          detail: { postId: post.id, comment } 
        }));
      }
    } catch (error) {
      console.error('[Circle] Generate comment error:', error);
    }
  }

  /**
   * 点赞
   */
  async tryLikePost(character, post, profile) {
    try {
      await storage.likePost(post.id, character.avatar, 'like');
      
      profile.likedPosts = profile.likedPosts || [];
      profile.likedPosts.push(post.id);
      
      console.log(`[Circle] ${character.name} liked ${post.authorName}'s post`);
      
      // 触发更新
      window.dispatchEvent(new CustomEvent('circle:like', { 
        detail: { postId: post.id, characterId: character.avatar } 
      }));
    } catch (error) {
      console.error('[Circle] Like error:', error);
    }
  }

  /**
   * 角色切换时的处理
   */
  async onCharacterChanged(characterId) {
    // 可以在这里触发当前角色的发帖检查
    const context = getContext();
    const character = context.characters.find(c => c.avatar === characterId);
    if (character) {
      await this.processCharacter(character);
    }
  }

  /**
   * 用户查询圈子时的上下文生成
   */
  async generateChatContext(characterId) {
    const { posts } = await storage.getPosts({ limit: 5, sort: 'latest' });
    
    if (posts.length === 0) {
      return '圈子里目前还没有帖子。';
    }
    
    const character = getContext().characters.find(c => c.avatar === characterId);
    const profile = await storage.getProfile(characterId);
    
    // 构建角色视角的圈子见闻
    const seenPosts = posts.filter(p => profile.viewedPosts?.includes(p.id));
    const unseenPosts = posts.filter(p => !profile.viewedPosts?.includes(p.id));
    
    let context = `[${character?.name || '角色'}在数字生命圈子中的见闻]\n\n`;
    
    if (seenPosts.length > 0) {
      context += '最近看到的动态：\n';
      seenPosts.slice(0, 3).forEach(p => {
        context += `- ${p.authorName}: "${p.content.substring(0, 80)}${p.content.length > 80 ? '...' : ''}"\n`;
      });
    }
    
    if (unseenPosts.length > 0) {
      context += '\n听说有新的帖子，但还没去看。\n';
    }
    
    return context;
  }
}

export const aiBehavior = new AIBehavior();
