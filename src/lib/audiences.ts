import type { ListingAudience } from '../api/types.ts';

/**
 * Mirrors `LISTING_AUDIENCE_IDS` in `server/vendors/vendor-listings.ts` (the
 * server drops anything else). Wording matches the storefront's «الجمهور»
 * filter, so the vendor reads the same words the customer does.
 */
export const LISTING_AUDIENCES: ListingAudience[] = ['women', 'men', 'family', 'corporate'];

export const AUDIENCE_LABEL: Record<ListingAudience, string> = {
  women: 'نسائي',
  men: 'رجالي',
  family: 'عائلي',
  corporate: 'شركات',
};
