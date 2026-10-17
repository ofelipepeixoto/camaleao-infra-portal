declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CAMALEAO_REVIEWER_SUBJECT?: string;
    CAMALEAO_AI_ENABLED?: string;
    CAMALEAO_AI_MODEL?: string;
    CAMALEAO_AI_GLOBAL_CAP_MICROUSD?: string;
    CAMALEAO_AI_CLIENT_CAP_MICROUSD?: string;
    CAMALEAO_AI_PRICE_VALID_UNTIL?: string;
    OPENAI_API_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
