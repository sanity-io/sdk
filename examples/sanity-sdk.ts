import config from './config';
import {createSanityInstance, documentManager} from '@sanity/sdk';

const sanityInstance = createSanityInstance(config);
const docManager = documentManager(sanityInstance)
docManager.get('Authors', { page: 1, pageSize: 10, sortby: 'title' }).subscribe((data) => {
  console.log(data);
});
