import { BrowserWindow } from 'electron'
import querystring from 'querystring'
import ElectronWebContentsWillNavigateShim from 'ElectronTools/ElectronWebContentsWillNavigateShim'

class BasicHTTPAuthHandler {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  constructor () {
    this.window = null
    this.callback = null
  }

  /**
  * Starts the authentication process
  * @param parent: the parent window
  * @param request: the request object
  * @param authInfo: the auth info object
  * @param callback: callback to execute with username and password
  */
  start (parent, request, authInfo, callback) {
    if (this.window) { return }

    this.callback = callback
    this.window = new BrowserWindow({
      parent: parent,
      modal: true,
      width: 450,
      height: 350,
      useContentSize: true,
      frame: false,
      center: true,
      resizable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      show: true,
      backgroundColor: 'white',
      webPreferences: {
        nodeIntegration: true,
        nodeIntegrationInWorker: false,
        webviewTag: false
      }
    })

    // Bind event listeners
    this.window.on('page-title-updated', this.handlePageTitleUpdated)

    // Load url
    const qs = querystring.stringify({
      port: authInfo.port,
      realm: authInfo.realm
    })
    this.window.loadURL(`file://${__dirname}/BasicHTTPAuthHandler.html?${qs}`)
    ElectronWebContentsWillNavigateShim.on(
      this.window.webContents,
      (evt) => evt.preventDefault()
    )
  }

  /* ****************************************************************************/
  // Event handlers
  /* ****************************************************************************/

  /**
  * Handles the page title updating
  * @param evt: the event that fired
  * @param title: the title that was set
  */
  handlePageTitleUpdated = (evt, title) => {
    if (title.startsWith('wbaction:')) {
      evt.preventDefault()

      if (title === 'wbaction:cancel') {
        this.callback(undefined, undefined)
        this.window.close()
      } else if (title === 'wbaction:login') {
        this.window.webContents.executeJavaScript(`[
          document.querySelector('[name="username"]').value,
          document.querySelector('[name="password"]').value
        ]`, (res) => {
          this.callback(res[0], res[1])
          this.window.close()
        })
      }
    }
  }
}

export default BasicHTTPAuthHandler
