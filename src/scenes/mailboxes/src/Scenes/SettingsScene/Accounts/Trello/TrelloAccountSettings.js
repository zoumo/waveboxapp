import PropTypes from 'prop-types'
import React from 'react'
import shallowCompare from 'react-addons-shallow-compare'
import AccountAppearanceSettings from '../AccountAppearanceSettings'
import AccountAdvancedSettings from '../AccountAdvancedSettings'
import AccountBadgeSettings from '../AccountBadgeSettings'
import AccountNotificationSettings from '../AccountNotificationSettings'
import AccountDestructiveSettings from '../AccountDestructiveSettings'
import CoreMailbox from 'shared/Models/Accounts/CoreMailbox'
import AccountCustomCodeSettings from '../AccountCustomCodeSettings'
import AccountBehaviourSettings from '../AccountBehaviourSettings'
import { mailboxActions, TrelloDefaultServiceReducer } from 'stores/mailbox'
import SettingsListSection from 'wbui/SettingsListSection'
import SettingsListSelect from 'wbui/SettingsListSelect'

export default class TrelloAccountSettings extends React.Component {
  /* **************************************************************************/
  // Class
  /* **************************************************************************/

  static propTypes = {
    mailbox: PropTypes.object.isRequired,
    showRestart: PropTypes.func.isRequired
  }

  /* **************************************************************************/
  // Rendering
  /* **************************************************************************/

  shouldComponentUpdate (nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState)
  }

  render () {
    const { mailbox, showRestart, onRequestEditCustomCode, ...passProps } = this.props
    const service = mailbox.serviceForType(CoreMailbox.SERVICE_TYPES.DEFAULT)

    return (
      <div {...passProps}>
        <AccountAppearanceSettings mailbox={mailbox} />
        <AccountBadgeSettings mailbox={mailbox} service={service} />
        <AccountNotificationSettings mailbox={mailbox} service={service} />
        <SettingsListSection>
          <SettingsListSelect
            label='Home board (opens on launch)'
            value={service.homeBoardId || 'default'}
            options={[ { value: 'default', label: 'Trello Home (Default)' } ].concat(
              Array.from(service.boards).map((board) => {
                return { value: board.id, label: board.name }
              })
            )}
            onChange={(evt, boardId) => {
              mailboxActions.reduceService(
                mailbox.id,
                service.type,
                TrelloDefaultServiceReducer.setHomeBoardId,
                boardId === 'default' ? undefined : boardId
              )
            }} />
        </SettingsListSection>
        <AccountBehaviourSettings mailbox={mailbox} service={service} />
        <AccountCustomCodeSettings
          mailbox={mailbox}
          service={service}
          onRequestEditCustomCode={onRequestEditCustomCode} />
        <AccountAdvancedSettings mailbox={mailbox} showRestart={showRestart} />
        <AccountDestructiveSettings mailbox={mailbox} />
      </div>
    )
  }
}
