const express = require('express');
const {
  createUserPreferencesHandler,
  codeChatIdentityHandler,
  createWorkspaceHandlers,
  createCapacityHandlers,
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

const router = express.Router();
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

const updateUserPreferences = createUserPreferencesHandler({
  updateStatefulCodeEnvironment: updateUserStatefulCodeEnvironment,
});

router.use('/settings', settings);
router.get('/', requireJwtAuth, getUserController);
router.get('/codechat-identity', requireJwtAuth, codeChatIdentityHandler);
router.post('/workspace/ensure', requireJwtAuth, workspace.ensure);
router.get('/workspace/capacity', requireJwtAuth, capacity.account);
router.post('/workspace/capacity/orders', requireJwtAuth, capacity.order);
router.post('/workspace/capacity/orders/:orderId/confirm-test', requireJwtAuth, capacity.confirm);
router.post('/workspace/capacity/orders/:orderId/retry', requireJwtAuth, capacity.retry);
router.post('/workspace/capacity/orders/:orderId/cancel', requireJwtAuth, capacity.cancel);
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
