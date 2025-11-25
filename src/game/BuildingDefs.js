const BUILDING_TYPES = {
    residential_small: {
        id: 'residential_small',
        name: 'Коттедж',
        type: 'residential',
        color: '#FFB7B2', // Soft Red/Pink
        baseScore: 10,
        synergy: {
            park: 5,
            residential: 5,
            shop: 5
        },
        antiSynergy: {
            industrial: -10
        }
    },
    residential_mid: {
        id: 'residential_mid',
        name: 'Панелька',
        type: 'residential',
        color: '#E0BBE4', // Soft Purple
        baseScore: 20,
        synergy: {
            shop: 10,
            park: 5,
            transport: 5
        },
        antiSynergy: {
            industrial: -15
        }
    },
    residential_high: {
        id: 'residential_high',
        name: 'ЖК "Мечта"',
        type: 'residential',
        color: '#957DAD', // Deep Purple
        baseScore: 50,
        synergy: {
            park: 20,
            cafe: 15
        },
        antiSynergy: {
            industrial: -30,
            residential_mid: -5
        }
    },
    park: {
        id: 'park',
        name: 'Сквер',
        type: 'nature',
        color: '#B5EAD7', // Soft Green
        baseScore: 5,
        synergy: {
            residential: 10, // Gives bonus to neighbors
            commercial: 5
        },
        antiSynergy: {
            industrial: -5
        }
    },
    shop: {
        id: 'shop',
        name: 'Магазин',
        type: 'commercial',
        color: '#FFDAC1', // Soft Orange
        baseScore: 15,
        synergy: {
            residential: 10,
            transport: 10
        },
        antiSynergy: {
            shop: -10 // Competition
        }
    },
    cafe: {
        id: 'cafe',
        name: 'Кофейня',
        type: 'commercial',
        color: '#FF9AA2', // Salmon
        baseScore: 20,
        synergy: {
            office: 15,
            residential_high: 15
        },
        antiSynergy: {
            industrial: -10
        }
    },
    industrial: {
        id: 'industrial',
        name: 'Завод',
        type: 'industrial',
        color: '#C7CEEA', // Greyish Blue
        baseScore: 30,
        synergy: {
            industrial: 15
        },
        antiSynergy: {
            residential: -20,
            nature: -20
        }
    },
    office: {
        id: 'office',
        name: 'Офис',
        type: 'commercial',
        color: '#A0C4FF', // Blue
        baseScore: 40,
        synergy: {
            cafe: 10,
            transport: 10
        },
        antiSynergy: {
            industrial: -5
        }
    }
};

const DECK_CONFIG = [
    { id: 'residential_small', weight: 20 },
    { id: 'residential_mid', weight: 15 },
    { id: 'residential_high', weight: 5 },
    { id: 'park', weight: 15 },
    { id: 'shop', weight: 15 },
    { id: 'cafe', weight: 10 },
    { id: 'industrial', weight: 10 },
    { id: 'office', weight: 10 }
];
