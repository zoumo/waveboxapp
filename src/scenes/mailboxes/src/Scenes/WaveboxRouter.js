import React from 'react'
import { HashRouter, Route, Switch } from 'react-router-dom'
import AppScene from './AppScene'
import EarlyBuildToast from './EarlyBuildToast'
import PrivacyDialog from './PrivacyDialog'
import ProScene from './ProScene'
import NewsScene from './NewsScene'
import MailboxReauthenticatingScene from './MailboxReauthenticatingScene'
import {
  CheckingUpdatesScene,
  UpdateAvailableScene,
  UpdateErrorScene,
  UpdateNoneScene
} from './UpdatesScene'
import LinuxSetupScene from './LinuxSetupScene'
import DictionaryInstallerScene from './DictionaryInstallerScene'
import AppWizardScene from './AppWizardScene'
import {
  MailboxWizardScene,
  ServiceAttachWizardScene,
  AccountWizardAddScene
} from './AccountWizardScene'
import SettingsScene from './SettingsScene'
import SitePermissionsScene from './SitePermissionsScene'
import MailboxServiceDeleteScene from './MailboxServiceDeleteScene'
import MailboxDeleteScene from './MailboxDeleteScene'
import ComposePickerScene from './ComposePickerScene'
import {
  AccountMessageScene,
  AccountAuthScene,
  AccountAuthenticatingScene,
  AccountStandaloneScene
} from './AccountScene'
import WaveboxRouterErrorBoundary from './WaveboxRouterErrorBoundary'
import WaveboxRouterNoMatch from './WaveboxRouterNoMatch'
import {
  ProfileRestoreScene,
  ProfileRestoreFetchingScene,
  ProfileRestoreRestartingScene
} from './ProfileRestoreScene'
import ErrorBoundary from 'wbui/ErrorBoundary'
import FullscreenSnackbarHelper from 'Components/FullscreenSnackbarHelper'
import SpinnerScene from './SpinnerScene'
import ReadingQueueSnackbarHelper from 'wbui/ReadingQueueSnackbarHelper'
// @Thomas101:cmdp import CommandPaletteScene from './CommandPaletteScene'
import SwitcherScene from './SwitcherScene'

export default class WaveboxRouter extends React.Component {
  /* **************************************************************************/
  // Rendering
  /* **************************************************************************/

  shouldComponentUpdate () { return false }

  render () {
    return (
      <HashRouter>
        <div>
          <AppScene />

          <ErrorBoundary>
            <EarlyBuildToast />
          </ErrorBoundary>
          <ErrorBoundary>
            <FullscreenSnackbarHelper />
          </ErrorBoundary>
          <ErrorBoundary>
            <ReadingQueueSnackbarHelper />
          </ErrorBoundary>

          <WaveboxRouterErrorBoundary>
            <Switch>
              {/* @Thomas101:cmdp
              <Route path='/command' component={CommandPaletteScene} />
              */}
              <Route path='/switcher/:mode?' component={SwitcherScene} />

              <Route path='/settings/:tab?/:tabArg?' component={SettingsScene} />
              <Route path='/site_permissions' component={SitePermissionsScene} />
              <Route path='/dictionary_installer' component={DictionaryInstallerScene} />

              <Route path='/mailbox_wizard/add/:mailboxId?' component={AccountWizardAddScene} />
              <Route path='/mailbox_wizard/:templateType/:accessMode/:step/:mailboxId?' component={MailboxWizardScene} />
              <Route path='/mailbox_attach_wizard/:attachTarget/:serviceType/:accessMode/:step/:serviceId?' component={ServiceAttachWizardScene} />

              <Route path='/mailbox/reauthenticating' component={MailboxReauthenticatingScene} />

              <Route path='/mailbox_delete/:mailboxId' component={MailboxDeleteScene} />
              <Route path='/mailbox_service_delete/:mailboxId/:serviceId' component={MailboxServiceDeleteScene} />

              <Route path='/app_wizard/:step?' component={AppWizardScene} />

              <Route path='/incoming/compose' component={ComposePickerScene} />

              <Route path='/updates/checking/:provider' component={CheckingUpdatesScene} />
              <Route path='/updates/none/:provider' component={UpdateNoneScene} />
              <Route path='/updates/error/:provider' component={UpdateErrorScene} />
              <Route path='/updates/install/:provider' component={UpdateAvailableScene} />
              <Route path='/updates/available/:provider' component={UpdateAvailableScene} />

              <Route path='/pro' component={ProScene} />
              <Route path='/news' component={NewsScene} />
              <Route path='/spinner' component={SpinnerScene} />

              <Route path='/account/message' component={AccountMessageScene} />
              <Route path='/account/auth/:mode?' component={AccountAuthScene} />
              <Route path='/account/authenticating' component={AccountAuthenticatingScene} />
              <Route path='/account/view' component={AccountStandaloneScene} />

              <Route path='/setup/linux' component={LinuxSetupScene} />

              <Route path='/profile/restore' component={ProfileRestoreScene} />
              <Route path='/profile/fetching_profiles' component={ProfileRestoreFetchingScene} />
              <Route path='/profile/restore_restarting' component={ProfileRestoreRestartingScene} />

              <Route component={WaveboxRouterNoMatch} />
            </Switch>
          </WaveboxRouterErrorBoundary>
          <PrivacyDialog />
        </div>
      </HashRouter>
    )
  }
}
