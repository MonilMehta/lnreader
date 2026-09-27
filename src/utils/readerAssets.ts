import { NativeModules, Platform } from 'react-native';
import NativeFile from '@modules/native-file';

export const readerFileAccessUrl = `file://${NativeFile.DocumentDirectoryPath}/`;
export const readerAssetsUri =
  Platform.OS === 'ios'
    ? `${readerFileAccessUrl}reader-assets`
    : __DEV__
    ? `${new URL(NativeModules.SourceCode.scriptURL).origin}/assets`
    : 'file:///android_asset';
