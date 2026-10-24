/**
 * Hearbor Secondary Live Stream Delegate
 * Replaces legacy small static catalogs with live massive-library delegation.
 */
import { anime3rbService } from './anime3rb.service.js';

export const OKANIME_CATALOG = [];

class OkanimeService {
  async getLatestEpisodes(page = 1) {
    return anime3rbService.getLatestEpisodes(page);
  }

  async search(query) {
    return anime3rbService.search(query);
  }

  async getShow(slug) {
    return anime3rbService.getShow(slug);
  }

  async getEpisode(slug, epNum = 1) {
    return anime3rbService.getEpisode(slug, epNum);
  }
}

export const okanimeService = new OkanimeService();
