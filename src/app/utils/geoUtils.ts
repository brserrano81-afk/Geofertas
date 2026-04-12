export type TransportMode = 'car' | 'bus' | 'foot' | 'bike';

export interface TransportCostOption {
    mode: TransportMode;
    label: string;
    emoji: string;
    cost: number;
    time: string;
}

const FUEL_PRICE = 6.19;

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateTransportCost(
    distanceKm: number,
    transportMode: TransportMode,
    consumption: number = 10,
    busTicket: number = 4.5,
): number {
    const roundTripKm = Math.max(distanceKm, 0) * 2;

    if (transportMode === 'foot' || transportMode === 'bike') {
        return 0;
    }

    if (transportMode === 'bus') {
        return Number((busTicket * 2).toFixed(2));
    }

    const liters = roundTripKm / Math.max(consumption, 1);
    return Number((liters * FUEL_PRICE).toFixed(2));
}

export function calculateAllTransportCosts(
    distanceKm: number,
    consumption: number = 10,
    busTicket: number = 4.5,
): TransportCostOption[] {
    const roundTripKm = Math.max(distanceKm, 0) * 2;
    const walkMinutes = Math.max(5, Math.round((distanceKm / 4.5) * 60));
    const bikeMinutes = Math.max(4, Math.round((distanceKm / 12) * 60));
    const busMinutes = Math.max(12, Math.round((distanceKm / 18) * 60) + 15);
    const carMinutes = Math.max(6, Math.round((distanceKm / 25) * 60));

    return [
        { mode: 'foot', label: 'A pé', emoji: '🚶', cost: 0, time: `${walkMinutes} min` },
        { mode: 'bike', label: 'Bike', emoji: '🚲', cost: 0, time: `${bikeMinutes} min` },
        { mode: 'bus', label: 'Ônibus', emoji: '🚌', cost: calculateTransportCost(distanceKm, 'bus', consumption, busTicket), time: `${busMinutes} min` },
        { mode: 'car', label: 'Carro', emoji: '🚗', cost: calculateTransportCost(distanceKm, 'car', consumption, busTicket), time: `${carMinutes} min` },
        {
            mode: 'car',
            label: 'Uber/Moto',
            emoji: '🛵',
            cost: Number(Math.max(8, roundTripKm * 1.4).toFixed(2)),
            time: `${Math.max(5, Math.round((distanceKm / 22) * 60))} min`,
        },
    ];
}
