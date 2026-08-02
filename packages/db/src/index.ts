import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema/index';

export * from './schema/index';
export { schema };

export type Db = PostgresJsDatabase<typeof schema>;

// Row / insert types (CONTRACTS §4 table set)
export type User = InferSelectModel<typeof schema.users>;
export type NewUser = InferInsertModel<typeof schema.users>;
export type Account = InferSelectModel<typeof schema.accounts>;
export type Session = InferSelectModel<typeof schema.sessions>;
export type VerificationToken = InferSelectModel<typeof schema.verificationTokens>;
export type Organization = InferSelectModel<typeof schema.organizations>;
export type NewOrganization = InferInsertModel<typeof schema.organizations>;
export type OrgMember = InferSelectModel<typeof schema.orgMembers>;
export type OrgInvite = InferSelectModel<typeof schema.orgInvites>;
export type ConnectedAccount = InferSelectModel<typeof schema.connectedAccounts>;
export type Website = InferSelectModel<typeof schema.websites>;
export type Agent = InferSelectModel<typeof schema.agents>;
export type NewAgent = InferInsertModel<typeof schema.agents>;
export type AgentRun = InferSelectModel<typeof schema.agentRuns>;
export type Conversation = InferSelectModel<typeof schema.conversations>;
export type Message = InferSelectModel<typeof schema.messages>;
export type Proposal = InferSelectModel<typeof schema.proposals>;
export type NewProposal = InferInsertModel<typeof schema.proposals>;
export type Approval = InferSelectModel<typeof schema.approvals>;
export type CampaignMirror = InferSelectModel<typeof schema.campaignsMirror>;
export type Budget = InferSelectModel<typeof schema.budgets>;
export type LeadForm = InferSelectModel<typeof schema.leadForms>;
export type Lead = InferSelectModel<typeof schema.leads>;
export type Report = InferSelectModel<typeof schema.reports>;
export type KnowledgeDocument = InferSelectModel<typeof schema.knowledgeDocuments>;
export type AuditLog = InferSelectModel<typeof schema.auditLogs>;
export type ProductEvent = InferSelectModel<typeof schema.productEvents>;
export type NewProductEvent = InferInsertModel<typeof schema.productEvents>;
export type SocialPost = InferSelectModel<typeof schema.socialPosts>;
export type NewSocialPost = InferInsertModel<typeof schema.socialPosts>;
export type ContentPiece = InferSelectModel<typeof schema.contentPieces>;
export type Competitor = InferSelectModel<typeof schema.competitors>;
export type CompetitorAdScan = InferSelectModel<typeof schema.competitorAdScans>;
export type VideoJob = InferSelectModel<typeof schema.videoJobs>;
export type Review = InferSelectModel<typeof schema.reviews>;

let client: postgres.Sql | undefined;
let instance: Db | undefined;

/**
 * Lazy singleton: importing this package never opens a connection.
 * The pool is created on first use from DATABASE_URL.
 */
export function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    client = postgres(url, { prepare: false });
    instance = drizzle(client, { schema });
  }
  return instance;
}

/** Convenience proxy so callers can `import { db }` without calling getDb(). */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
  // Libraries (e.g. @auth/drizzle-adapter) detect the drizzle dialect by
  // walking the prototype chain — forward it to the real instance.
  getPrototypeOf() {
    return Object.getPrototypeOf(getDb());
  },
  has(_target, prop) {
    return Reflect.has(getDb() as object, prop);
  },
}) as Db;

/** Close the underlying pool (CLI scripts, tests). */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end();
    client = undefined;
    instance = undefined;
  }
}
