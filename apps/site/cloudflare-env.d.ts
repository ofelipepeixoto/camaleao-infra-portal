declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CAMALEAO_REVIEWER_SUBJECT?: string;
    BUCKET?: R2Bucket;
  }
}
