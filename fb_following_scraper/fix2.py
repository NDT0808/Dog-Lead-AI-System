import re

with open('background.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_func = '''function buildFollowingUrl(input) {
  let originalUrl = input.trim();
  if (originalUrl.includes('profile.php?id=')) {
    originalUrl = originalUrl.replace(/([&?])sk=followers/i, '1sk=following');
    if (!originalUrl.includes('sk=following')) {
      const joiner = originalUrl.includes('?') ? '&' : '?';
      return originalUrl + joiner + 'sk=following';
    }
    return originalUrl;
  }
  originalUrl = originalUrl.replace(/\/followers(\/?)$/i, '/following1');
  if (!/\/(following)(\/?)$/i.test(originalUrl)) {
    return originalUrl.replace(/\/+$/, '') + '/following';
  }
  return originalUrl;
}'''

# Fix double dollar back to single for the javascript string
new_func = new_func.replace('', '$')

content = re.sub(r'function buildFollowingUrl\(input\)\s*\{[\s\S]*?\n\}', new_func, content)

with open('background.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
