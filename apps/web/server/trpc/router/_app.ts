import { router } from '../trpc';
import { authRouter } from './auth';
import { orgsRouter } from './orgs';
import { onboardingRouter } from './onboarding';
import { conversationsRouter } from './conversations';
import { proposalsRouter } from './proposals';
import { approvalsRouter } from './approvals';
import { agentsRouter } from './agents';
import { campaignsRouter } from './campaigns';
import { dashboardRouter } from './dashboard';
import { leadsRouter } from './leads';
import { knowledgeRouter } from './knowledge';
import { auditRouter } from './audit';
import { settingsRouter } from './settings';
import { adminRouter } from './admin';
import { socialRouter } from './social';
import { contentRouter } from './content';
import { competitorsRouter } from './competitors';
import { alertsRouter } from './alerts';
import { portalRouter } from './portal';
import { creativesRouter } from './creatives';
import { reviewsRouter } from './reviews';
import { reportsRouter } from './reports';
import { modelsRouter } from './models';
import { memoryRouter } from './memory';
import { videoRouter } from './video';

export const appRouter = router({
  auth: authRouter,
  orgs: orgsRouter,
  onboarding: onboardingRouter,
  conversations: conversationsRouter,
  proposals: proposalsRouter,
  approvals: approvalsRouter,
  agents: agentsRouter,
  campaigns: campaignsRouter,
  dashboard: dashboardRouter,
  leads: leadsRouter,
  knowledge: knowledgeRouter,
  audit: auditRouter,
  settings: settingsRouter,
  admin: adminRouter,
  social: socialRouter,
  content: contentRouter,
  competitors: competitorsRouter,
  alerts: alertsRouter,
  portal: portalRouter,
  creatives: creativesRouter,
  reviews: reviewsRouter,
  reports: reportsRouter,
  models: modelsRouter,
  memory: memoryRouter,
  video: videoRouter,
});

export type AppRouter = typeof appRouter;
