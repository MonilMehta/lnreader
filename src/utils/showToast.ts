import { Alert, Platform, ToastAndroid } from 'react-native';

export const showToast = (...message: string[]) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message.join(' '), ToastAndroid.SHORT);
  } else {
    Alert.alert('', message.join(' '));
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.trace('Toast: ', message);
  }
};
