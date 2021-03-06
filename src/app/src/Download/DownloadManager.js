import { session, app, dialog, BrowserWindow } from 'electron'
import uuid from 'uuid'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { settingsStore } from 'stores/settings'
import { userStore } from 'stores/user'
import unusedFilename from 'unused-filename'
import WaveboxWindow from 'Windows/WaveboxWindow'
import MailboxesWindow from 'Windows/MailboxesWindow'
import ElectronCookie from 'ElectronTools/ElectronCookie'
import fetch from 'electron-fetch'
import mime from 'mime'

const MAX_PLATFORM_START_TIME = 1000 * 30

class DownloadManager {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  constructor () {
    this.user = {
      partitions: new Set(),
      inProgress: new Map(),
      lastPath: null
    }
    this.platform = {
      queue: new Map()
    }
  }

  /* ****************************************************************************/
  // Utils
  /* ****************************************************************************/

  _getMailboxesWindow () { return WaveboxWindow.getOfType(MailboxesWindow) }

  /* ****************************************************************************/
  // User downloads
  /* ****************************************************************************/

  /**
  * Adds the user download manager to the given partition
  * @param partition: the partition to listen on
  */
  setupUserDownloadHandlerForPartition (partition) {
    if (this.user.partitions.has(partition)) { return }
    this.user.partitions.add(partition)

    const ses = session.fromPartition(partition)
    ses.setDownloadPath(app.getPath('downloads'))
    ses.on('will-download', this._handleUserDownload)
  }

  /**
  * Removes the download manager for given partition
  * @param partition: the partition to teardown
  */
  teardownUserDownloadHandlerForPartition (partition) {
    if (!this.user.partitions.has(partition)) { return }
    this.user.partitions.delete(partition)

    const ses = session.fromPartition(partition)
    ses.removeListener('will-download', this._handleUserDownload)
  }

  /* ****************************************************************************/
  // User downloads: Handlers
  /* ****************************************************************************/

  /**
  * Handles a user download
  * @param evt: the event that fired
  * @param item: the download item
  * @param wc: the webcontents that triggered the vent
  */
  _handleUserDownload = (evt, item, wc) => {
    if (this._isPlatformDownload(item, wc)) { return }

    const settingsState = settingsStore.getState()

    if (userStore.getState().wceUseAsyncDownloadHandler(settingsState.os.rawUseAsyncDownloadHandler)) {
      // Grab a bunch of stuff from the event and item as it will be destroyed
      const ses = evt.sender
      const itemFilename = item.getFilename()
      const itemUrl = item.getURL()
      const itemTotalBytes = item.getTotalBytes()

      // Stop normal behaviour
      evt.preventDefault()

      Promise.resolve()
        .then(() => {
          // Download target picking
          if (!settingsState.os.alwaysAskDownloadLocation && settingsState.os.defaultDownloadLocation) {
            const folderLocation = settingsState.os.defaultDownloadLocation

            // Check the containing folder exists
            fs.ensureDirSync(folderLocation)
            const savePath = unusedFilename.sync(path.join(folderLocation, itemFilename))
            return Promise.resolve(savePath)
          } else {
            return new Promise((resolve, reject) => {
              const lastPath = this.user.lastPath
              const parentWindow = BrowserWindow.fromWebContents(wc.hostWebContents ? wc.hostWebContents : wc)
              dialog.showSaveDialog(parentWindow, {
                title: 'Download',
                defaultPath: path.join(lastPath || app.getPath('downloads'), itemFilename)
              }, (pickedSavePath) => {
                // There's a bit of a pickle here. Whilst asking the user where to save
                // they may have omitted the file extension. At the same time they may chosen
                // a filename that is already taken. We don't have any in-built ui to handle
                // this so the least destructive way is to find a filename that is not
                // in use and just save to there. In any case if the user picks a path and
                // that file does already exist we should remove it
                if (pickedSavePath) {
                  // Remove existing file - save dialog prompts before allowing user to choose pre-existing name
                  try { fs.removeSync(pickedSavePath) } catch (ex) { /* no-op */ }

                  // User didn't add file extension
                  if (path.extname(pickedSavePath) !== path.extname(itemFilename)) {
                    pickedSavePath += path.extname(itemFilename)
                    pickedSavePath = unusedFilename.sync(pickedSavePath)
                  }
                  resolve(pickedSavePath)
                } else {
                  reject(new Error('User cancelled'))
                }
              })
            })
          }
        })
        .then((pickedSavePath) => {
          // Actual Download
          const downloadPath = unusedFilename.sync(pickedSavePath)
          const downloadId = uuid.v4()
          this.user.lastPath = path.dirname(downloadPath)

          return Promise.resolve()
            .then(() => ElectronCookie.cookieHeaderForUrl(ses.cookies, itemUrl))
            .then((cookieHeader) => { return { 'User-Agent': ses.getUserAgent(), 'Cookie': cookieHeader } })
            .then((headers) => fetch(itemUrl, { headers: headers, useElectronNet: true, session: ses }))
            .then((res) => {
              if (res.ok) {
                const out = fs.createWriteStream(downloadPath)
                const progressUpdater = setInterval(() => {
                  this._updateUserDownloadProgress(downloadId, out.bytesWritten, itemTotalBytes)
                }, 250)

                return new Promise((resolve, reject) => {
                  res.body.pipe(out)
                  res.body.on('error', (err) => {
                    clearInterval(progressUpdater)
                    reject(err)
                  })
                  out.on('finish', () => {
                    clearInterval(progressUpdater)
                    resolve()
                  })
                  out.on('error', (err) => {
                    clearInterval(progressUpdater)
                    reject(err)
                  })
                })
              } else {
                return Promise.reject(new Error(`Invalid HTTP status code ${res.httpStatus}`))
              }
            })
            .then(() => {
              this._userDownloadFinished(downloadId, downloadPath)
            })
            .catch((ex) => {
              // Tidy-up on failure
              try { fs.removeSync(downloadPath) } catch (ex) { /* no-op */ }
              this._userDownloadFinished(downloadId, undefined)
            })
        })
        .catch((ex) => { /* no-op */ })
    } else {
      // Find out where to save the file
      let savePath
      if (!settingsState.os.alwaysAskDownloadLocation && settingsState.os.defaultDownloadLocation) {
        const folderLocation = settingsState.os.defaultDownloadLocation

        // Check the containing folder exists
        fs.ensureDirSync(folderLocation)
        savePath = unusedFilename.sync(path.join(folderLocation, item.getFilename()))
      } else {
        const lastPath = this.user.lastPath
        const parentWindow = BrowserWindow.fromWebContents(wc.hostWebContents ? wc.hostWebContents : wc)
        let pickedSavePath = dialog.showSaveDialog(parentWindow, {
          title: 'Download',
          defaultPath: path.join(lastPath || app.getPath('downloads'), item.getFilename())
        })

        // There's a bit of a pickle here. Whilst asking the user where to save
        // they may have omitted the file extension. At the same time they may chosen
        // a filename that is already taken. We don't have any in-built ui to handle
        // this so the least destructive way is to find a filename that is not
        // in use and just save to there. In any case if the user picks a path and
        // that file does already exist we should remove it
        if (pickedSavePath) {
          // Remove existing file - save dialog prompts before allowing user to choose pre-existing name
          try { fs.removeSync(pickedSavePath) } catch (ex) { /* no-op */ }

          // User didn't add file extension
          if (path.extname(pickedSavePath) !== path.extname(item.getFilename())) {
            pickedSavePath += path.extname(item.getFilename())
            pickedSavePath = unusedFilename.sync(pickedSavePath)
          }
          savePath = pickedSavePath
        }
      }

      // Check we still want to save
      if (!savePath) {
        item.cancel()
        return
      }

      // Set the save - will prevent dialog showing up
      const downloadPath = unusedFilename.sync(savePath) // just-in-case
      item.setSavePath(downloadPath)
      this.user.lastPath = path.dirname(savePath)

      // Report the progress to the window to display it
      const totalBytes = item.getTotalBytes()
      const id = uuid.v4()
      item.on('updated', () => {
        this._updateUserDownloadProgress(id, item.getReceivedBytes(), totalBytes)
      })
      item.on('done', (e, state) => {
        // Event will get destroyed before move callback completes. If
        // you need any info from it grab it before calling fs.move
        if (state === 'completed') {
          this._userDownloadFinished(id, downloadPath)
        } else {
          // Tidy-up on failure
          try { fs.removeSync(downloadPath) } catch (ex) { /* no-op */ }
          this._userDownloadFinished(id, undefined)
        }
      })
    }
  }

  /**
  * Updates the progress bar in the dock
  */
  _updateDownloadProgressBar = () => {
    const all = Array.from(this.user.inProgress.values()).reduce((acc, { received, total }) => {
      return {
        received: acc.received + received,
        total: acc.total + total
      }
    }, { received: 0, total: 0 })

    const mainWindow = this._getMailboxesWindow()
    if (mainWindow) {
      if (isNaN(all.received) || isNaN(all.total)) {
        mainWindow.setProgressBar(-1)
      } else if (all.received === 0 && all.total === 0) {
        mainWindow.setProgressBar(-1)
      } else {
        mainWindow.setProgressBar(all.received / all.total)
      }
    }
  }

  /**
  * Updates the progress on a download
  * @param id: the download id
  * @param received: the bytes received
  * @param total: the total bytes to download
  */
  _updateUserDownloadProgress = (id, received, total) => {
    const next = {
      ...this.user.inProgress.get(id),
      received: received,
      total: total
    }
    this.user.inProgress.set(id, next)
    this._updateDownloadProgressBar()
  }

  /**
  * Indicates that a download has finished
  * @param id: the download id
  * @param savePath: the path to the downloaded file or undefined if something went wrong
  */
  _userDownloadFinished = (id, savePath) => {
    this.user.inProgress.delete(id)
    this._updateDownloadProgressBar()
    if (savePath) {
      const saveName = path.basename(savePath)
      const mainWindow = this._getMailboxesWindow()
      if (mainWindow) {
        mainWindow.downloadCompleted(savePath, saveName)
      }

      if (process.platform === 'darwin') {
        app.dock.downloadFinished(savePath)
      }
    }
  }

  /* ****************************************************************************/
  // Platform downloads
  /* ****************************************************************************/

  /**
  * Starts a platform download to os temp folder
  * @param transportWebContents: the webcontents to run the download through
  * @param url: the url to download
  * @param downloadPath: the path to download to
  * @return promise with the save path
  */
  startPlatformDownloadToTemp (transportWebContents, url) {
    const id = uuid.v4().replace(/-/g, '')
    const tmpPath = path.join(os.tmpdir(), id)
    return this.startPlatformDownload(transportWebContents, url, tmpPath)
  }

  /**
  * Starts a platform download
  * @param transportWebContents: the webcontents to run the download through
  * @param url: the url to download
  * @param downloadPath: the path to download to
  * @return promise with the actual save path. This allows you to forego specifying an extension
  */
  startPlatformDownload (transportWebContents, url, downloadPath) {
    if (userStore.getState().wceUseAsyncDownloadHandler(settingsStore.getState().os.rawUseAsyncDownloadHandler)) {
      return Promise.resolve()
        .then(() => ElectronCookie.cookieHeaderForUrl(transportWebContents.session.cookies, url))
        .then((cookieHeader) => {
          return {
            'User-Agent': transportWebContents.session.getUserAgent(),
            'Cookie': cookieHeader
          }
        })
        .then((headers) => fetch(url, {
          headers: headers,
          useElectronNet: true,
          session: transportWebContents.session
        }))
        .then((res) => {
          if (res.ok) {
            const mimeExtension = mime.getExtension(res.headers.get('content-type'))
            const ext = mimeExtension ? `.${mimeExtension}` : null
            let actualSavePath = downloadPath
            if (ext && path.extname(downloadPath) !== ext) {
              actualSavePath = `${downloadPath}${ext}`
            }

            return new Promise((resolve, reject) => {
              const out = fs.createWriteStream(actualSavePath)

              res.body.pipe(out)
              res.body.on('error', (err) => { reject(err) })
              out.on('finish', () => { resolve(actualSavePath) })
              out.on('error', (err) => { reject(err) })
            })
          } else {
            return Promise.reject(new Error(`Invalid HTTP status code ${res.httpStatus}`))
          }
        })
        .catch((ex) => { /* no-op */ })
    } else {
      const id = uuid.v4()
      this.platform.queue.set(id, {
        webContents: transportWebContents.id,
        url: url,
        id: id,
        ts: new Date().getTime()
      })

      return new Promise((resolve, reject) => {
        let timeout
        let handler

        timeout = setTimeout(() => {
          transportWebContents.session.removeListener('will-download', handler)
          this.platform.queue.delete(id)
          reject(new Error('Timeout'))
        }, MAX_PLATFORM_START_TIME)

        handler = (evt, item, wc) => {
          // Check
          const downloadId = this._getPlatformDownloadId(item, wc)
          if (downloadId === undefined) { return }

          // Dequeue
          this.platform.queue.delete(downloadId)
          transportWebContents.session.removeListener('will-download', handler)
          clearTimeout(timeout)

          // Get save path
          let actualSavePath = downloadPath
          if (path.extname(downloadPath) !== path.extname(item.getFilename())) {
            actualSavePath = downloadPath + path.extname(item.getFilename())
          }
          item.setSavePath(actualSavePath)

          // Bind listeners
          item.once('done', (doneEvt, state) => {
            if (state === 'completed') {
              resolve(actualSavePath)
            } else {
              reject(new Error(`Download failed: ${state}`))
            }
          })
        }
        transportWebContents.session.on('will-download', handler)
        transportWebContents.downloadURL(url)
      })
    }
  }

  /**
  * Checks to see if this is a platform download
  * @param item: the download item
  * @param wc: the webcontents that triggered the vent
  * @return true if this is a platform download
  */
  _isPlatformDownload (item, webContents) {
    return this._getPlatformDownloadId(item, webContents) !== undefined
  }

  /**
  * Gets the id of the platform download
  * @param item: the download item
  * @param wc: the webcontents that triggered the vent
  * @return the download id if it is a platform download, undefined otherwise
  */
  _getPlatformDownloadId (item, webContents) {
    const platformDownload = Array.from(this.platform.queue.values()).find((platformItem) => {
      if (platformItem.webContents === webContents.id && platformItem.url === item.getURLChain()[0]) {
        return true
      } else {
        return false
      }
    })
    return platformDownload ? platformDownload.id : undefined
  }
}

export default new DownloadManager()
