import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

/**
 * GET /api/community/posts
 * Fetch community posts with reaction summaries and user's reaction
 */
router.get('/posts', (req, res) => {
  try {
    const { tag, filter, uid } = req.query;
    const currentUserId = req.user?.uid || req.user?.id || req.user?.email || uid || '';

    let sql = 'SELECT * FROM community_posts';
    const params = [];
    const conditions = [];

    if (tag && tag !== 'all') {
      conditions.push('tag = ?');
      params.push(tag);
    }

    if (filter === 'pinned') {
      conditions.push('is_pinned = 1');
    } else if (filter === 'mine' && currentUserId) {
      conditions.push('uid = ?');
      params.push(String(currentUserId));
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    if (filter === 'trending') {
      sql += ' ORDER BY is_pinned DESC, (likes_count + comments_count * 2) DESC, created_at DESC';
    } else {
      sql += ' ORDER BY is_pinned DESC, created_at DESC';
    }

    sql += ' LIMIT 60';

    const posts = db.prepare(sql).all(...params);

    // Enrich with reaction data and user reaction
    const enriched = posts.map((post) => {
      let userReaction = null;
      if (currentUserId) {
        const r = db.prepare('SELECT reaction_type FROM community_reactions WHERE post_id = ? AND user_id = ?')
          .get(post.id, String(currentUserId));
        if (r) userReaction = r.reaction_type;
      }

      // Group reactions by type
      const reactionRows = db.prepare('SELECT reaction_type, COUNT(*) as cnt FROM community_reactions WHERE post_id = ? GROUP BY reaction_type')
        .all(post.id);
      const reactions = {
        like: 0,
        love: 0,
        haha: 0,
        wow: 0,
        sad: 0
      };
      reactionRows.forEach(row => {
        if (reactions[row.reaction_type] !== undefined) {
          reactions[row.reaction_type] = row.cnt;
        }
      });

      return {
        ...post,
        reactions,
        userReaction
      };
    });

    // Dual contract: the Community UI consumes { ok, posts }; the platform
    // spec requires { success, data: [{ postId, title, author }] } — serve both.
    const specData = enriched.map((p) => ({
      postId: String(p.id),
      title: String(p.content || '').split('\n')[0].slice(0, 140),
      author: {
        username: p.author_username || p.author_name || '',
        isVerified: ['developer', 'admin', 'moderator', 'creator'].includes(String(p.author_role || '').toLowerCase()),
        vipStatus: 'free'
      }
    }));
    res.json({ ok: true, posts: enriched, success: true, data: specData });
  } catch (err) {
    console.error('Error fetching community posts:', err);
    res.status(500).json({ error: 'fetch_failed', message: err.message });
  }
});

/**
 * POST /api/community/posts
 * Create a new post
 */
router.post('/posts', requireAuth, (req, res) => {
  try {
    const { content, tag, tagName, imageUrl, voiceUrl, voiceDuration } = req.body || {};

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'empty_content', message: 'Content cannot be empty' });
    }

    const effectiveUid = req.user.id;
    const effectiveAuthor = req.user.displayName || req.user.display_name || req.user.username || 'Hearbor user';
    const effectiveUsername = req.user.username || '';
    const effectiveAvatar = req.user.photoURL || req.user.photo_url || '';
    const isDev = req.user.role === 'developer';
    const effectiveRole = isDev ? 'developer' : 'user';

    const result = db.prepare(`
      INSERT INTO community_posts (
        uid, author_name, author_username, author_avatar, author_role,
        tag, tag_name, content, image_url, voice_url, voice_duration, is_pinned, likes_count, comments_count, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'))
    `).run(
      String(effectiveUid),
      effectiveAuthor,
      effectiveUsername,
      effectiveAvatar,
      effectiveRole,
      tag || 'general',
      tagName || 'عام',
      content.trim(),
      imageUrl || '',
      voiceUrl || '',
      Number(voiceDuration) || 0,
      isDev && req.body.isPinned ? 1 : 0
    );

    const post = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(result.lastInsertRowid);

    res.json({
      ok: true,
      post: {
        ...post,
        reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0 },
        userReaction: null
      }
    });
  } catch (err) {
    console.error('Error creating community post:', err);
    res.status(500).json({ error: 'create_failed', message: err.message });
  }
});

/**
 * POST /api/community/posts/:id/react
 * React to a post (like, love, haha, wow, sad)
 */
router.post('/posts/:id/react', requireAuth, (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { reactionType = 'like' } = req.body || {};
    const effectiveUserId = req.user.id;

    if (!Number.isInteger(postId) || postId < 1) {
      return res.status(400).json({ error: 'invalid_post_id', message: 'Invalid post ID' });
    }
    if (!['like', 'love', 'haha', 'wow', 'sad'].includes(reactionType)) {
      return res.status(400).json({ error: 'invalid_reaction', message: 'Unsupported reaction type' });
    }
    if (!db.prepare('SELECT id FROM community_posts WHERE id = ?').get(postId)) {
      return res.status(404).json({ error: 'not_found', message: 'Post not found' });
    }

    const existing = db.prepare('SELECT id, reaction_type FROM community_reactions WHERE post_id = ? AND user_id = ?')
      .get(postId, String(effectiveUserId));

    let newUserReaction = null;

    if (existing) {
      if (existing.reaction_type === reactionType) {
        // Toggle off
        db.prepare('DELETE FROM community_reactions WHERE id = ?').run(existing.id);
        newUserReaction = null;
      } else {
        // Update reaction type
        db.prepare('UPDATE community_reactions SET reaction_type = ? WHERE id = ?').run(reactionType, existing.id);
        newUserReaction = reactionType;
      }
    } else {
      // Insert new reaction
      db.prepare(`
        INSERT INTO community_reactions (post_id, user_id, reaction_type, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(postId, String(effectiveUserId), reactionType);
      newUserReaction = reactionType;
    }

    // Recalculate total likes/reactions count
    const totalCount = db.prepare('SELECT COUNT(*) as cnt FROM community_reactions WHERE post_id = ?')
      .get(postId)?.cnt || 0;
    db.prepare('UPDATE community_posts SET likes_count = ? WHERE id = ?').run(totalCount, postId);

    // Group breakdown
    const reactionRows = db.prepare('SELECT reaction_type, COUNT(*) as cnt FROM community_reactions WHERE post_id = ? GROUP BY reaction_type')
      .all(postId);
    const reactions = { like: 0, love: 0, haha: 0, wow: 0, sad: 0 };
    reactionRows.forEach(row => {
      if (reactions[row.reaction_type] !== undefined) reactions[row.reaction_type] = row.cnt;
    });

    res.json({
      ok: true,
      likesCount: totalCount,
      userReaction: newUserReaction,
      reactions
    });
  } catch (err) {
    console.error('Error reacting to community post:', err);
    res.status(500).json({ error: 'react_failed', message: err.message });
  }
});

/**
 * GET /api/community/posts/:id/comments
 * Fetch comments for a post
 */
router.get('/posts/:id/comments', (req, res) => {
  try {
    const postId = Number(req.params.id);
    const comments = db.prepare('SELECT * FROM community_comments WHERE post_id = ? ORDER BY created_at ASC')
      .all(postId);
    res.json({ ok: true, comments });
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'fetch_comments_failed', message: err.message });
  }
});

/**
 * POST /api/community/posts/:id/comments
 * Add a comment to a post
 */
router.post('/posts/:id/comments', requireAuth, (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { content } = req.body || {};

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'empty_comment', message: 'Comment content cannot be empty' });
    }

    const effectiveUserId = req.user.id;
    const effectiveAuthor = req.user.displayName || req.user.display_name || req.user.username || 'Hearbor user';
    const effectiveAvatar = req.user.photoURL || req.user.photo_url || '';
    const effectiveRole = req.user.role === 'developer' ? 'developer' : 'user';

    const result = db.prepare(`
      INSERT INTO community_comments (post_id, user_id, author_name, author_avatar, author_role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      postId,
      String(effectiveUserId),
      effectiveAuthor,
      effectiveAvatar,
      effectiveRole,
      content.trim()
    );

    // Update post comments count
    const totalComments = db.prepare('SELECT COUNT(*) as cnt FROM community_comments WHERE post_id = ?')
      .get(postId)?.cnt || 0;
    db.prepare('UPDATE community_posts SET comments_count = ? WHERE id = ?').run(totalComments, postId);

    const comment = db.prepare('SELECT * FROM community_comments WHERE id = ?').get(result.lastInsertRowid);

    res.json({ ok: true, comment, commentsCount: totalComments });
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ error: 'add_comment_failed', message: err.message });
  }
});

/**
 * DELETE /api/community/posts/:id
 * Delete a post (by author or developer)
 */
router.delete('/posts/:id', requireAuth, (req, res) => {
  try {
    const postId = Number(req.params.id);
    const post = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(postId);
    if (!post) {
      return res.status(404).json({ error: 'not_found', message: 'Post not found' });
    }

    const currentUserId = String(req.user.id);
    const isDev = req.user.role === 'developer';

    if (!isDev && post.uid !== String(currentUserId)) {
      return res.status(403).json({ error: 'forbidden', message: 'Permission denied' });
    }

    db.prepare('DELETE FROM community_posts WHERE id = ?').run(postId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ error: 'delete_failed', message: err.message });
  }
});

export default router;
