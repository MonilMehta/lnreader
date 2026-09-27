import { rebaseIOSDocumentPaths } from '../iosPaths';

it('rebases device and simulator file links after a sandbox UUID changes', () => {
  const root = '/var/mobile/Containers/Data/Application/1234-ABCD/Documents';
  const simulator =
    '/Users/test/Library/Developer/CoreSimulator/Devices/ABCD/data/Containers/Data/Application/1111/Documents';
  const device =
    '/private/var/mobile/Containers/Data/Application/2222/Documents';
  expect(rebaseIOSDocumentPaths(`file://${simulator}/cover.jpg`, root)).toBe(
    `file://${root}/cover.jpg`,
  );
  expect(
    rebaseIOSDocumentPaths(
      `<img src="file://${device}/chapter/a b.png">`,
      root,
    ),
  ).toBe(`<img src="file://${root}/chapter/a b.png">`);
  expect(rebaseIOSDocumentPaths('https://example.com/cover.jpg', root)).toBe(
    'https://example.com/cover.jpg',
  );
});
