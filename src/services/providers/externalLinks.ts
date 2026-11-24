/**
 * Deep links to free public flight-search websites, so the user can always continue a
 * search (and verify any price) elsewhere. No data is fetched from these sites.
 */
import type { ExternalLink } from '../../domain/types';
import type { IsoDate } from '../../lib/dates';

export const ANYWHERE = 'ANYWHERE';

const ddmm = (d: IsoDate) => d.slice(8, 10) + d.slice(5, 7);
const yymmdd = (d: IsoDate) => d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);

export function externalSearchLinks(origin: string, destination: string, departure: IsoDate, returnDate: IsoDate, passengers = 1): ExternalLink[] {
  const pax = Math.min(9, Math.max(1, passengers));
  const sky = pax > 1 ? `?adultsv2=${pax}` : '';
  const gf = pax > 1 ? ` for ${pax} adults` : '';
  if (destination === ANYWHERE) {
    return [
      { label: 'Google Flights Explore', url: `https://www.google.com/travel/explore?q=${encodeURIComponent(`Flights from ${origin} on ${departure} through ${returnDate}`)}` },
      { label: 'Skyscanner (everywhere)', url: `https://www.skyscanner.net/transport/flights-from/${origin.toLowerCase()}/` },
    ];
  }
  return [
    {
      label: 'Google Flights',
      url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${destination} on ${departure} through ${returnDate}${gf}`)}`,
    },
    {
      label: 'Skyscanner',
      url: `https://www.skyscanner.net/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${yymmdd(departure)}/${yymmdd(returnDate)}/${sky}`,
    },
    { label: 'Aviasales', url: `https://www.aviasales.com/search/${origin}${ddmm(departure)}${destination}${ddmm(returnDate)}${pax}` },
  ];
}

/** Links for a trip that returns to a different airport (two one-way searches). */
export function openJawSearchLinks(origin: string, destination: string, returnTo: string, departure: IsoDate, returnDate: IsoDate, passengers = 1): ExternalLink[] {
  const pax = Math.min(9, Math.max(1, passengers));
  const sky = pax > 1 ? `?adultsv2=${pax}` : '';
  const gf = pax > 1 ? ` for ${pax} adults` : '';
  return [
    {
      label: 'Google Flights',
      url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`One way flights from ${origin} to ${destination} on ${departure}${gf}`)}`,
    },
    {
      label: `Skyscanner ${origin}→${destination}`,
      url: `https://www.skyscanner.net/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${yymmdd(departure)}/${sky}`,
    },
    {
      label: `Skyscanner ${destination}→${returnTo}`,
      url: `https://www.skyscanner.net/transport/flights/${destination.toLowerCase()}/${returnTo.toLowerCase()}/${yymmdd(returnDate)}/${sky}`,
    },
    { label: `Aviasales ${origin}→${destination}`, url: `https://www.aviasales.com/search/${origin}${ddmm(departure)}${destination}${pax}` },
    { label: `Aviasales ${destination}→${returnTo}`, url: `https://www.aviasales.com/search/${destination}${ddmm(returnDate)}${returnTo}${pax}` },
  ];
}
