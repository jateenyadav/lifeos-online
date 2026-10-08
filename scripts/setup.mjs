import { copyFile, constants } from 'node:fs/promises';

for (const [source, destination] of [
  ['server/.env.example', 'server/.env'],
  ['apps/web/.env.example', 'apps/web/.env'],
  [
    'apps/mobile/config/development.example.json',
    'apps/mobile/config/development.json',
  ],
]) {
  try {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    console.log(`Created ${destination}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Kept existing ${destination}`);
  }
}
