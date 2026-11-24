/**
 * Deep links to free public flight-search websites, so the user can always continue a
 * search (and verify any price) elsewhere. No data is fetched from these sites.
 */
import type { ExternalLink } from '../../domain/types';
import type { IsoDate } from '../../lib/dates';

export const ANYWHERE = 'ANYWHERE';

const ddmm = (d: IsoDate) => d.slice(8, 10) + d.slice(5, 7);
const yymmdd = (d: IsoDate) => d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);

export function externalSearchLinks(origin: string, destination: string, departure: IsoDate, returnDate: IsoDate): ExternalLink[] {
  if (destination === ANYWHERE) {
    return [
      { label: 'Google Flights Explore', url: `https://www.google.com/travel/explore?q=${encodeURIComponent(`Flights from ${origin} on ${departure} through ${returnDate}`)}` },
      { label: 'Skyscanner (everywhere)', url: `https://www.skyscanner.net/transport/flights-from/${origin.toLowerCase()}/` },
    ];
  }
  return [
    {
      label: 'Google Flights',
      url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${destination} on ${departure} through ${returnDate}`)}`,
    },
    {
      label: 'Skyscanner',
      url: `https://www.skyscanner.net/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${yymmdd(departure)}/${yymmdd(returnDate)}/`,
    },
    { label: 'Aviasales', url: `https://www.aviasales.com/search/${origin}${ddmm(departure)}${destination}${ddmm(returnDate)}1` },
  ];
}
