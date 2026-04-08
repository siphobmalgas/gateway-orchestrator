export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const readTag = (xml: string, tagName: string): string | undefined => {
  const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1];
};
