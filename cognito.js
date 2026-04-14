'use strict';

const {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GlobalSignOutCommand,
  ChangePasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const { cognitoClient } = require('../config/aws');
const { COGNITO_ATTRS } = require('../config/constants');

const USER_POOL_ID = () => process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = () => process.env.COGNITO_CLIENT_ID;

/**
 * Register a new user.
 *
 * Uses AdminCreateUser so the backend controls the flow — no
 * confirmation email loop from Cognito itself. We then immediately force
 * the permanent password with AdminSetUserPassword so the user can log
 * in right away.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.givenName
 * @param {string} params.familyName
 * @param {string} params.orgName
 * @param {string} params.npi
 * @param {string} params.taxId
 * @param {string} params.accountType
 * @returns {Promise<{ userSub: string }>}
 */
async function signUp({ email, password, givenName, familyName, orgName, npi, taxId, accountType }) {
  try {
    const createResult = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID(),
        Username: email,
        // Suppress the default Cognito welcome email — we send our own.
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'given_name', Value: givenName },
          { Name: 'family_name', Value: familyName },
          { Name: COGNITO_ATTRS.ORG_NAME, Value: orgName || '' },
          { Name: COGNITO_ATTRS.NPI, Value: npi || '' },
          { Name: COGNITO_ATTRS.TAX_ID, Value: taxId || '' },
          { Name: COGNITO_ATTRS.ACCOUNT_TYPE, Value: accountType || 'PROVIDER' },
        ],
      }),
    );

    const userSub = createResult.User.Attributes.find((a) => a.Name === 'sub').Value;

    // Set a permanent password immediately so the user is not stuck in
    // FORCE_CHANGE_PASSWORD status.
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID(),
        Username: email,
        Password: password,
        Permanent: true,
      }),
    );

    return { userSub };
  } catch (err) {
    // Rethrow with the original AWS error code intact so our error handler
    // can map it to the right HTTP status.
    throw err;
  }
}

/**
 * Authenticate a user with email + password.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @returns {Promise<{ accessToken, idToken, refreshToken, expiresIn }>}
 */
async function signIn({ email, password }) {
  try {
    const result = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID(),
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
    );

    const auth = result.AuthenticationResult;
    return {
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      refreshToken: auth.RefreshToken,
      expiresIn: auth.ExpiresIn,
      tokenType: auth.TokenType,
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Initiate the forgot-password flow — Cognito sends a verification code.
 *
 * @param {object} params
 * @param {string} params.email
 */
async function forgotPassword({ email }) {
  try {
    await cognitoClient.send(
      new ForgotPasswordCommand({
        ClientId: CLIENT_ID(),
        Username: email,
      }),
    );
  } catch (err) {
    throw err;
  }
}

/**
 * Complete the forgot-password flow using the code Cognito sent.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.confirmationCode
 * @param {string} params.newPassword
 */
async function confirmForgotPassword({ email, confirmationCode, newPassword }) {
  try {
    await cognitoClient.send(
      new ConfirmForgotPasswordCommand({
        ClientId: CLIENT_ID(),
        Username: email,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
      }),
    );
  } catch (err) {
    throw err;
  }
}

/**
 * Obtain a fresh set of tokens using a refresh token.
 *
 * @param {object} params
 * @param {string} params.refreshToken
 * @returns {Promise<{ accessToken, idToken, expiresIn }>}
 */
async function refreshToken({ refreshToken: token }) {
  try {
    const result = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: CLIENT_ID(),
        AuthParameters: {
          REFRESH_TOKEN: token,
        },
      }),
    );

    const auth = result.AuthenticationResult;
    return {
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      expiresIn: auth.ExpiresIn,
      tokenType: auth.TokenType,
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Invalidate all tokens issued to the user (global sign-out).
 *
 * @param {object} params
 * @param {string} params.accessToken  The user's current access token.
 */
async function signOut({ accessToken }) {
  try {
    await cognitoClient.send(
      new GlobalSignOutCommand({
        AccessToken: accessToken,
      }),
    );
  } catch (err) {
    throw err;
  }
}

/**
 * Change the authenticated user's password.
 *
 * @param {object} params
 * @param {string} params.accessToken
 * @param {string} params.previousPassword
 * @param {string} params.proposedPassword
 */
async function changePassword({ accessToken, previousPassword, proposedPassword }) {
  try {
    await cognitoClient.send(
      new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: previousPassword,
        ProposedPassword: proposedPassword,
      }),
    );
  } catch (err) {
    throw err;
  }
}

module.exports = {
  signUp,
  signIn,
  forgotPassword,
  confirmForgotPassword,
  refreshToken,
  signOut,
  changePassword,
};
