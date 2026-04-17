import { Audio } from 'expo-av';

/** Loops `assets/Alert.mp3` while new orders await manager acceptance. */

let sound = null;
let sessionId = 0;
let loadPromise = null;

function getAlertSource() {
  return require('../../assets/Alert.mp3');
}

export async function startPendingOrderAlertLoop() {
  if (sound) return;
  if (loadPromise) return loadPromise;

  const mySession = sessionId;

  loadPromise = (async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound: loaded } = await Audio.Sound.createAsync(getAlertSource(), {
        isLooping: true,
        shouldPlay: true,
        volume: 1,
      });

      if (mySession !== sessionId) {
        await loaded.unloadAsync();
        return;
      }

      sound = loaded;
    } catch (e) {
      console.warn('⚠️ Pending order alert audio failed:', e?.message ?? e);
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export async function stopPendingOrderAlertLoop() {
  sessionId += 1;
  const instance = sound;
  sound = null;
  if (!instance) return;
  try {
    await instance.stopAsync();
  } catch (_) {
    /* ignore */
  }
  try {
    await instance.unloadAsync();
  } catch (_) {
    /* ignore */
  }
}
