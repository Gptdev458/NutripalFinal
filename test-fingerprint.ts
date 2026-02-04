// Standalone test script to verify fingerprint logic
// Run with: npx ts-node test-fingerprint.ts

interface Ingredient {
    name: string;
    quantity?: number;
    unit?: string;
}

function calculateFingerprint(ingredients: Ingredient[]) {
    const stopWords = [
        'of', 'a', 'an', 'the', 'large', 'small', 'medium', 'fresh', 'dried', 'ground',
        'chopped', 'sliced', 'diced', 'clove', 'cloves', 'and', 'with', 'optional',
        'raw', 'cooked', 'cup', 'cups', 'tbsp', 'tsp', 'gram', 'grams', 'oz', 'ounce',
        'scoop', 'scoops', 'whole', 'piece', 'pieces'
    ];

    // Helper for stemming (simple plural stripper)
    const singularize = (word: string) => {
        // Very basic stemming for ingredients
        if (word.endsWith('es') && word.length > 3) return word.slice(0, -2); // box->box (approx), tomatoes->tomato (approx)
        if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
        return word;
    };

    return ingredients.map((ing) => {
        // Normalize name: lowercase, remove special chars AND NUMBERS, remove stop words
        // Replace numbers with space to split effectively
        let n = ing.name.trim().toLowerCase().replace(/[^a-z ]/g, ' ');
        // Remove stop words from the name itself
        const parts = n.split(/\s+/).filter((p) => !stopWords.includes(p) && p.length > 1).map((p) => singularize(p));
        return parts.join(' ');
    }).filter((n) => n.length > 0).sort().join(',');
}

const testCases = [
    {
        name: "Basic Identity",
        a: [{ name: "banana" }, { name: "oats" }],
        b: [{ name: "banana" }, { name: "oats" }]
    },
    {
        name: "Order Independence",
        a: [{ name: "banana" }, { name: "oats" }],
        b: [{ name: "oats" }, { name: "banana" }]
    },
    {
        name: "Quantity Variation (numbers)",
        a: [{ name: "1 banana" }, { name: "50g oats" }],
        b: [{ name: "banana" }, { name: "oats" }]
    },
    {
        name: "Stop Words",
        a: [{ name: "large banana" }, { name: "cup of oats" }],
        b: [{ name: "banana" }, { name: "oats" }]
    },
    {
        name: "Plurals",
        a: [{ name: "2 bananas" }, { name: "oats" }],
        b: [{ name: "banana" }, { name: "oat" }] // Note: oats might become oat
    },
    {
        name: "Complex Mix",
        a: [{ name: "1 large banana, sliced" }, { name: "1/2 cup rolled oats" }],
        b: [{ name: "banana" }, { name: "oats" }]
    },
    {
        name: "Real World Fail Use Case",
        a: [{ name: "1 scoop whey" }, { name: "250ml milk" }, { name: "1 banana" }],
        b: [{ name: "Whey Protein" }, { name: "Milk" }, { name: "Banana" }]
    }
];

testCases.forEach(test => {
    console.log(`\nTest Case: ${test.name}`);
    const fpA = calculateFingerprint(test.a);
    const fpB = calculateFingerprint(test.b);
    console.log(`  A: "${test.a.map(i => i.name).join(', ')}" -> [${fpA}]`);
    console.log(`  B: "${test.b.map(i => i.name).join(', ')}" -> [${fpB}]`);
    console.log(`  Match: ${fpA === fpB ? '✅ YES' : '❌ NO'}`);
});
