import { getDocumentAsync } from 'expo-document-picker';
import { Directory } from 'expo-file-system';
import NativeFile from './src/NativeFileModule';
import { rebaseIOSDocumentPaths } from '@utils/iosPaths';

const rebase = (value: string) =>
  rebaseIOSDocumentPaths(value, NativeFile.DocumentDirectoryPath);

export default {
  ...NativeFile,
  async readFile(path: string) {
    return rebase(await NativeFile.readFile(rebase(path)));
  },
  async copyFile(source: string, destination: string) {
    return NativeFile.copyFile(rebase(source), rebase(destination));
  },
  async createDocument(filename: string) {
    if (
      !filename ||
      filename === '.' ||
      filename === '..' ||
      /[/\\]/.test(filename)
    ) {
      throw new Error('Invalid destination file name');
    }
    // The app's Documents folder is visible in Files; backups stay in the sandbox.
    return `${NativeFile.DocumentDirectoryPath}/${filename}`;
  },
  async pickDocument(mimeType: string) {
    const result = await getDocumentAsync({
      type: mimeType,
      copyToCacheDirectory: true,
    });
    if (result.canceled) throw new Error('Cancelled');
    return result.assets[0].uri;
  },
  async pickDirectory() {
    const directory = await Directory.pickDirectoryAsync();
    return { uri: directory.uri, name: directory.name };
  },
};
