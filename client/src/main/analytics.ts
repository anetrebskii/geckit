// https://kilianvalkhof.com/2018/apps/using-google-analytics-to-gather-usage-statistics-in-electron/

import { app } from 'electron';

import Analytics from 'electron-google-analytics4';

import { v4 as uuidv4 } from 'uuid';
import { JSONStorage } from 'node-localstorage';

const nodeStorage = new JSONStorage(app.getPath('userData'));

const userId = nodeStorage.getItem('userid') || uuidv4();
nodeStorage.setItem('userid', userId);

const analytics = new Analytics('G-297Y3KYMG4', 'KpNXmpFVRtmT1FIFt8EjuQ');

type EventType =
  | 'settingsOpened'
  | 'settingsSaved'
  | 'shortcutPressed'
  | 'correctBtnClicked'
  | 'translateBtnClicked'
  | 'explainBtnClicked';

// Retrieve the userid value, and if it's not there, assign it a new uuid.

analytics.setUserProperties({ user_id: userId });

export default async function trackEvent(event: EventType) {
  analytics.event(event);
}

global.trackEvent = trackEvent;
