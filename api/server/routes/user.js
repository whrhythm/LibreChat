const express = require('express');
const {
  createUserPreferencesHandler,
  codeChatIdentityHandler,
  createWorkspaceHandlers,
  createProgrammingHandlers,
  createCapacityHandlers,
  createVersionHandlers,
  createWorkspaceProjectHandlers,
  createAIProjectHandlers,
  createKnowledgeHandlers,
  createTrialHandlers,
  generateCheckAccess,
  createBusinessTemplateHandlers,
  createProjectDatabaseHandlers,
  preAuthTenantMiddleware,
  requirePreAuthTenantContext,
} = require('@librechat/api');
const {
  updateUserPluginsController,
  resendVerificationController,
  getTermsStatusController,
  acceptTermsController,
  verifyEmailController,
  requestEmailChangeController,
  confirmEmailChangeController,
  deleteUserController,
  getUserController,
} = require('~/server/controllers/UserController');
const {
  verifyEmailLimiter,
  emailChangeLimiter,
  emailChangeSubmissionLimiter,
  emailChangeSubmissionIpLimiter,
  verifyEmailSubmissionLimiter,
  configMiddleware,
  strictConfigMiddleware,
  canDeleteAccount,
  requireJwtAuth,
} = require('~/server/middleware');

const settings = require('./settings');
const { updateUserStatefulCodeEnvironment } = require('~/models');
const { ensurePrivateProjectAgent, enableProjectKnowledge, getRoleByName } = require('~/models');
const { ensurePrivateTrialAgent, getAgent, getConvo, getMessages } = require('~/models');
const { grantPermission } = require('~/server/services/PermissionService');
const { PermissionTypes, Permissions } = require('librechat-data-provider');

const router = express.Router();
const aiProjects = createAIProjectHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
  ensurePrivateProjectAgent,
  grantPermission,
});
const checkAIProjectCreate = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});
const knowledge = createKnowledgeHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
  enableProjectKnowledge,
});
const trials = createTrialHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
  ensurePrivateTrialAgent, getAgent, getConvo, getMessages, grantPermission,
});
router.get('/workspace/ai-projects/:projectId/trials', requireJwtAuth, configMiddleware, trials.list);
router.post('/workspace/ai-projects/:projectId/trials/initialize', requireJwtAuth, checkAIProjectCreate, configMiddleware, trials.initialize);
router.post('/workspace/ai-projects/:projectId/trials/update', requireJwtAuth, checkAIProjectCreate, configMiddleware, trials.update);
router.post('/workspace/ai-projects/:projectId/trials', requireJwtAuth, checkAIProjectCreate, configMiddleware, trials.create);
router.post('/workspace/ai-projects/:projectId/trials/:trialId/resume', requireJwtAuth, checkAIProjectCreate, configMiddleware, trials.resume);
router.post('/workspace/ai-projects/:projectId/trials/:trialId/acceptance', requireJwtAuth, checkAIProjectCreate, configMiddleware, trials.accept);
router.get(
  '/workspace/ai-projects/:projectId/knowledge/:revisionId/source',
  requireJwtAuth,
  configMiddleware,
  knowledge.source,
);
router.get(
  '/workspace/ai-projects/:projectId/knowledge',
  requireJwtAuth,
  configMiddleware,
  knowledge.list,
);
router.post(
  '/workspace/ai-projects/:projectId/knowledge',
  requireJwtAuth,
  checkAIProjectCreate,
  configMiddleware,
  knowledge.import,
);
router.post(
  '/workspace/ai-projects/:projectId/knowledge/:revisionId/retry',
  requireJwtAuth,
  checkAIProjectCreate,
  configMiddleware,
  knowledge.retry,
);
router.post(
  '/workspace/ai-projects/:projectId/knowledge/:revisionId/remove',
  requireJwtAuth,
  checkAIProjectCreate,
  configMiddleware,
  knowledge.remove,
);
router.get('/workspace/ai-projects', requireJwtAuth, aiProjects.list);
router.post(
  '/workspace/ai-projects',
  requireJwtAuth,
  checkAIProjectCreate,
  configMiddleware,
  aiProjects.create,
);
router.post(
  '/workspace/ai-projects/:projectId/resume',
  requireJwtAuth,
  checkAIProjectCreate,
  configMiddleware,
  aiProjects.resume,
);
const templates = createBusinessTemplateHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
});
router.get('/workspace/business-templates', requireJwtAuth, templates.catalog);
router.post('/workspace/business-templates', requireJwtAuth, templates.create);
router.get('/workspace/business-templates/:projectId', requireJwtAuth, templates.status);
router.post('/workspace/business-templates/:projectId/prepare', requireJwtAuth, templates.prepare);
router.get('/workspace/business-templates/:projectId/preview', requireJwtAuth, templates.preview);
router.post('/workspace/business-templates/:projectId/access', requireJwtAuth, templates.access);
router.put(
  '/workspace/business-templates/:projectId/acceptance',
  requireJwtAuth,
  templates.acceptance,
);
const projects = createWorkspaceProjectHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
});
router.get('/workspace/projects', requireJwtAuth, projects.list);
router.put('/workspace/projects', requireJwtAuth, projects.save);
router.get('/workspace/projects/:projectId', requireJwtAuth, projects.context);
router.get('/workspace/projects/:projectId/source', requireJwtAuth, projects.source);
const versions = createVersionHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
});
router.get('/workspace/versions', requireJwtAuth, versions.list);
router.post('/workspace/versions', requireJwtAuth, versions.create);
router.get('/workspace/versions/:versionId/diff', requireJwtAuth, versions.diff);
router.post('/workspace/versions/:versionId/restore', requireJwtAuth, versions.restore);
router.delete('/workspace/versions/:versionId', requireJwtAuth, versions.remove);
const workspace = createWorkspaceHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
});
const capacity = createCapacityHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
});
const programming = createProgrammingHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
});
const databases = createProjectDatabaseHandlers({
  baseUrl: process.env.CODECHAT_WORKSPACE_URL,
  serviceToken: process.env.CODECHAT_SERVICE_TOKEN,
  issuer: process.env.OPENID_ISSUER,
});

const updateUserPreferences = createUserPreferencesHandler({
  updateStatefulCodeEnvironment: updateUserStatefulCodeEnvironment,
});

router.use('/settings', settings);
router.get('/', requireJwtAuth, getUserController);
router.get('/codechat-identity', requireJwtAuth, codeChatIdentityHandler);
router.post('/workspace/ensure', requireJwtAuth, workspace.ensure);
router.get('/workspace/agent/preferences', requireJwtAuth, programming.preferences);
router.get('/workspace/agent/mcp', requireJwtAuth, programming.mcp);
router.put('/workspace/agent/mcp/:serverId/credential', requireJwtAuth, programming.credential);
router.put('/workspace/agent/preferences', requireJwtAuth, programming.save);
router.get('/workspace/agent/tasks', requireJwtAuth, programming.tasks);
router.get('/workspace/agent/tasks/:taskId', requireJwtAuth, programming.task);
router.get('/workspace/agent/tasks/:taskId/stream', requireJwtAuth, programming.stream);
router.post('/workspace/agent/tasks/:taskId/decision', requireJwtAuth, programming.decision);
router.post('/workspace/agent/tasks/:taskId/cancel', requireJwtAuth, programming.cancel);
router.get('/workspace/agent/tasks/:taskId/acceptance', requireJwtAuth, programming.acceptance);
router.put('/workspace/agent/tasks/:taskId/acceptance', requireJwtAuth, programming.saveAcceptance);
router.get('/workspace/capacity', requireJwtAuth, capacity.account);
router.post('/workspace/object-storage/retry', requireJwtAuth, capacity.objectRetry);
router.get('/workspace/databases', requireJwtAuth, databases.list);
router.post('/workspace/databases', requireJwtAuth, databases.create);
router.post('/workspace/databases/:databaseId/retry', requireJwtAuth, databases.retry);
router.post('/workspace/databases/:databaseId/delete', requireJwtAuth, databases.remove);
router.post('/workspace/capacity/orders', requireJwtAuth, capacity.order);
router.post('/workspace/capacity/orders/:orderId/confirm-test', requireJwtAuth, capacity.confirm);
router.post('/workspace/capacity/orders/:orderId/retry', requireJwtAuth, capacity.retry);
router.post('/workspace/capacity/orders/:orderId/cancel', requireJwtAuth, capacity.cancel);
router.post('/workspace/capacity/orders/:orderId/checkout', requireJwtAuth, capacity.checkout);
router.get('/workspace/capacity/orders/:orderId/payment', requireJwtAuth, capacity.payment);
router.get('/workspace/apps', requireJwtAuth, workspace.apps);
router.post('/workspace/apps', requireJwtAuth, workspace.publish);
router.post('/workspace/apps/:applicationId/start', requireJwtAuth, workspace.start);
router.post('/workspace/apps/:applicationId/stop', requireJwtAuth, workspace.stop);
router.post('/workspace/apps/:applicationId/delete', requireJwtAuth, workspace.remove);
router.get('/workspace/directories', requireJwtAuth, workspace.list);
router.post('/workspace/directories', requireJwtAuth, workspace.mkdir);
router.get('/workspace/file', requireJwtAuth, workspace.read);
router.delete('/workspace/file', requireJwtAuth, workspace.deleteFile);
router.get('/workspace/usage', requireJwtAuth, workspace.usage);
router.get('/workspace/archive', requireJwtAuth, workspace.archive);
router.get('/workspace/models', requireJwtAuth, workspace.models);
router.put(
  '/workspace/file',
  requireJwtAuth,
  express.raw({ type: 'application/octet-stream', limit: '16mb' }),
  workspace.write,
);
router.patch('/preferences', requireJwtAuth, configMiddleware, updateUserPreferences);
router.get('/terms', requireJwtAuth, getTermsStatusController);
router.post('/terms/accept', requireJwtAuth, acceptTermsController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.delete('/delete', requireJwtAuth, canDeleteAccount, configMiddleware, deleteUserController);
router.post(
  '/email/change',
  requireJwtAuth,
  emailChangeLimiter,
  strictConfigMiddleware,
  requestEmailChangeController,
);
router.post(
  '/email/verify',
  emailChangeSubmissionIpLimiter,
  emailChangeSubmissionLimiter,
  confirmEmailChangeController,
);
router.post(
  '/verify',
  preAuthTenantMiddleware,
  requirePreAuthTenantContext,
  verifyEmailSubmissionLimiter,
  verifyEmailController,
);
router.post(
  '/verify/resend',
  preAuthTenantMiddleware,
  requirePreAuthTenantContext,
  verifyEmailLimiter,
  resendVerificationController,
);

module.exports = router;
