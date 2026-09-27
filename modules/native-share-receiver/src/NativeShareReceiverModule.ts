import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export type NativeShareReceiverEvents = {
  SharedText: (payload: { text: string }) => void;
};

declare class NativeShareReceiverModule extends NativeModule<NativeShareReceiverEvents> {
  getInitialSharedText(): string | null;
}

export default requireOptionalNativeModule<NativeShareReceiverModule>(
  'NativeShareReceiver',
);
