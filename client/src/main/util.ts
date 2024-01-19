/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';

export function resolveHtmlPath(
  htmlFileName: string,
  queryPath: string | null = null,
) {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    let urlStr = `http://localhost:${port}`;
    if (queryPath) {
      urlStr += `/#/${queryPath}`;
    }
    const url = new URL(urlStr);
    url.pathname = htmlFileName;
    return url.href;
  }
  return `file://${
    path.resolve(__dirname, '../renderer/', htmlFileName) +
    (queryPath ? `#${queryPath}` : '')
  }`;
}
