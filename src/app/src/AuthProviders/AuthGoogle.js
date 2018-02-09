import { ipcMain } from 'electron'
import { WB_AUTH_GOOGLE, WB_AUTH_GOOGLE_COMPLETE, WB_AUTH_GOOGLE_ERROR } from 'shared/ipcEvents'
import googleapis from 'googleapis'
import { userStore } from 'stores/user'
import url from 'url'
import querystring from 'querystring'
import pkg from 'package.json'
import AuthWindow from 'Windows/AuthWindow'

class AuthGoogle {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  constructor () {
    ipcMain.on(WB_AUTH_GOOGLE, (evt, body) => {
      this.handleAuthGoogle(evt, body)
    })
  }

  /* ****************************************************************************/
  // Authentication
  /* ****************************************************************************/

  /**
  * Generates the authentication url for our secrets, scopes and access type
  * @param credentials: the credentials to use
  * @return the url that can be used to authenticate with goog
  */
  generateGoogleAuthenticationURL (credentials) {
    const oauth2Client = new googleapis.auth.OAuth2(
      credentials.GOOGLE_CLIENT_ID,
      credentials.GOOGLE_CLIENT_SECRET,
      credentials.GOOGLE_AUTH_RETURN_URL
    )
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/plus.me',
        'profile',
        'email',
        'https://www.googleapis.com/auth/gmail.readonly'
      ]
    })
    return url
  }

  /**
  * Generates the url for authenticating with the push service
  * @param credentials: the credentials to use
  * @return the url that can be used
  */
  generatePushServiceAuthenticationURL (credentials) {
    const userState = userStore.getState()
    const query = querystring.stringify({
      client_id: userState.clientId,
      client_token: userState.clientToken,
      client_version: pkg.version
    })
    return `${credentials.GOOGLE_PUSH_SERVICE_AUTH_URL}?${query}`
  }

  /**
  * Gets the authorization code by prompting the user to sign in
  * @param credentials: the credentials to use
  * @param partitionId: the id of the partition
  * @return promise
  */
  promptUserToGetAuthorizationCode (credentials, partitionId) {
    return new Promise((resolve, reject) => {
      const waveboxOauthWin = new AuthWindow()
      waveboxOauthWin.create(this.generatePushServiceAuthenticationURL(credentials), {
        useContentSize: true,
        center: true,
        show: true,
        resizable: false,
        standardWindow: true,
        autoHideMenuBar: true,
        title: 'Google',
        height: 750,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: partitionId.indexOf('persist:') === 0 ? partitionId : 'persist:' + partitionId
        }
      })
      const oauthWin = waveboxOauthWin.window
      let userClose = true

      oauthWin.on('closed', () => {
        if (userClose) {
          reject(new Error('User closed the window'))
        }
      })

      // Step 1: Handle push service auth
      let pushServiceToken
      oauthWin.webContents.on('did-get-redirect-request', (evt, prevUrl, nextUrl) => {
        if (nextUrl.indexOf(credentials.GOOGLE_PUSH_SERVICE_SUCCESS_URL) === 0) {
          evt.preventDefault()
          const purl = url.parse(nextUrl, true)
          pushServiceToken = purl.query.token
          oauthWin.loadURL(this.generateGoogleAuthenticationURL(credentials))
        } else if (nextUrl.indexOf(credentials.GOOGLE_PUSH_SERVICE_FAILURE_URL) === 0) {
          evt.preventDefault()
          userClose = false
          oauthWin.close()
          const purl = url.parse(nextUrl, true)
          reject(new Error(purl.query.error))
        }
      })

      // Step 2: Handle Google auth
      oauthWin.on('page-title-updated', (evt) => {
        if (!pushServiceToken) { return }
        setTimeout(() => {
          const title = oauthWin.getTitle()
          if (title.startsWith('Denied')) {
            userClose = false
            oauthWin.close()
            reject(new Error(title.split(/[ =]/)[2]))
          } else if (title.startsWith('Success')) {
            userClose = false
            oauthWin.close()
            resolve({
              push: pushServiceToken,
              google: title.split(/[ =]/)[2]
            })
          }
        })
      })
    })
  }

  /* ****************************************************************************/
  // Request Handlers
  /* ****************************************************************************/

  /**
  * Handles the oauth request
  * @param evt: the incoming event
  * @param body: the body sent to us
  */
  handleAuthGoogle (evt, body) {
    Promise.resolve()
      .then(() => this.promptUserToGetAuthorizationCode(body.credentials, body.id))
      .then(({ push, google }) => {
        evt.sender.send(WB_AUTH_GOOGLE_COMPLETE, {
          id: body.id,
          authMode: body.authMode,
          provisional: body.provisional,
          temporaryCode: google,
          pushToken: push,
          codeRedirectUri: body.credentials.GOOGLE_AUTH_RETURN_URL
        })
      }, (err) => {
        evt.sender.send(WB_AUTH_GOOGLE_ERROR, {
          id: body.id,
          authMode: body.authMode,
          provisional: body.provisional,
          error: err,
          errorString: (err || {}).toString ? (err || {}).toString() : undefined,
          errorMessage: (err || {}).message ? (err || {}).message : undefined,
          errorStack: (err || {}).stack ? (err || {}).stack : undefined
        })
      })
  }
}

export default AuthGoogle
