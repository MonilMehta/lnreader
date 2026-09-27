// iOS changes the sandbox UUID on reinstall/update; saved EPUB links must follow it.
export const rebaseIOSDocumentPaths = (
  value: string,
  documentDirectory: string,
) =>
  value.replace(
    /\/(?:Users\/[^/]+\/Library\/Developer\/CoreSimulator\/Devices\/[^/]+\/data\/|(?:private\/)?var\/mobile\/)Containers\/Data\/Application\/[A-Fa-f0-9-]+\/Documents(?=\/|$)/g,
    () => documentDirectory,
  );
