export type Work = {
  id: string;
  title: string;
  audio_url: string;
  hls_url?: string;
  cover_url?: string;
  moods?: string[];
  c2pa_verified?: boolean;
  parent_work_id?: string;
  parent_work_title?: string;
  is_ai_generated?: boolean;
};

export type FeedPost = {
  id: string;
  caption?: string;
  like_count: number;
  comment_count?: number;
  liked_by_me?: boolean;
  author_is_following?: boolean;
  collected_by_me?: boolean;
  author_username?: string;
  author_creator_level?: string;
  tags?: string[];
  recommend_reason?: string;
  work?: Work;
};
