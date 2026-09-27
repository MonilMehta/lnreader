import { epub } from '@modules/nitro-epub';
import { updateNovelInfo } from '@database/queries/NovelQueries';
import { importEpub } from '../import';

jest.mock('@modules/nitro-epub', () => ({
  epub: { parseNovelAndChapters: jest.fn() },
}));
jest.mock('@database/db', () => ({
  dbManager: { write: jest.fn().mockResolvedValue({ insertId: 1 }) },
}));
jest.mock('@database/queries/NovelQueries', () => ({
  updateNovelCategoryById: jest.fn(),
  updateNovelInfo: jest.fn(),
}));
jest.mock('@plugins/pluginManager', () => ({ LOCAL_PLUGIN_ID: 'local' }));
jest.mock('@i18n/translations', () => ({ getString: (key: string) => key }));

it('leaves the cover unset when an imported EPUB has no cover', async () => {
  jest.mocked(epub.parseNovelAndChapters).mockResolvedValue({
    name: 'No cover',
    cover: '',
    author: '',
    artist: '',
    summary: '',
    chapters: [],
    imagePaths: [],
    cssPaths: [],
  });
  await importEpub({ uri: '/test.epub', filename: 'test.epub' }, jest.fn());
  expect(updateNovelInfo).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'No cover', cover: undefined }),
  );
});
