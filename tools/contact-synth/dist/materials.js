/*
 * A material is three numbers: stiffness (Young's modulus), density and
 * internal loss factor. Wave speed sqrt(E/ρ) sets pitch for a given geometry,
 * E sets contact hardness (how short and bright a hit is), and η sets how long
 * it rings. Values are typical handbook figures.
 */
export const MATERIALS = [
    // Metals: stiff, low loss, ring for a long time.
    { id: 'steel', label: 'Steel (mild)', group: 'Metal', stiffness: 200, density: 7850, loss: 0.0004 },
    { id: 'stainless', label: 'Stainless steel', group: 'Metal', stiffness: 193, density: 8000, loss: 0.0006 },
    { id: 'springsteel', label: 'Spring steel (hardened)', group: 'Metal', stiffness: 210, density: 7850, loss: 0.00015 },
    { id: 'castiron', label: 'Cast iron', group: 'Metal', stiffness: 110, density: 7200, loss: 0.005 },
    { id: 'aluminum', label: 'Aluminium', group: 'Metal', stiffness: 69, density: 2700, loss: 0.0005 },
    { id: 'brass', label: 'Brass', group: 'Metal', stiffness: 105, density: 8500, loss: 0.0008 },
    { id: 'bronze', label: 'Bell bronze', group: 'Metal', stiffness: 110, density: 8800, loss: 0.0003 },
    { id: 'copper', label: 'Copper', group: 'Metal', stiffness: 117, density: 8960, loss: 0.0015 },
    { id: 'titanium', label: 'Titanium', group: 'Metal', stiffness: 116, density: 4500, loss: 0.0005 },
    { id: 'zinc', label: 'Zinc die-cast (Zamak)', group: 'Metal', stiffness: 85, density: 6700, loss: 0.003 },
    { id: 'lead', label: 'Lead', group: 'Metal', stiffness: 16, density: 11340, loss: 0.04 },
    // Plastics: ~100× softer, ~7× lighter, ~50× more lossy: short, woody "tok"s and clicks.
    { id: 'abs', label: 'ABS', group: 'Plastic', stiffness: 2.3, density: 1050, loss: 0.02 },
    { id: 'polycarbonate', label: 'Polycarbonate (PC)', group: 'Plastic', stiffness: 2.4, density: 1200, loss: 0.012 },
    { id: 'acrylic', label: 'Acrylic (PMMA)', group: 'Plastic', stiffness: 3.2, density: 1180, loss: 0.03 },
    { id: 'polystyrene', label: 'Polystyrene (PS)', group: 'Plastic', stiffness: 3.2, density: 1050, loss: 0.012 },
    { id: 'pom', label: 'Acetal / POM (Delrin)', group: 'Plastic', stiffness: 3.0, density: 1410, loss: 0.01 },
    { id: 'nylon', label: 'Nylon (PA)', group: 'Plastic', stiffness: 2.8, density: 1140, loss: 0.035 },
    { id: 'pvc', label: 'PVC (rigid)', group: 'Plastic', stiffness: 3.0, density: 1400, loss: 0.03 },
    { id: 'pet', label: 'PET', group: 'Plastic', stiffness: 2.8, density: 1380, loss: 0.02 },
    { id: 'pp', label: 'Polypropylene (PP)', group: 'Plastic', stiffness: 1.5, density: 905, loss: 0.05 },
    { id: 'hdpe', label: 'HDPE', group: 'Plastic', stiffness: 1.0, density: 955, loss: 0.07 },
    { id: 'ldpe', label: 'LDPE (soft)', group: 'Plastic', stiffness: 0.25, density: 920, loss: 0.12 },
    { id: 'ptfe', label: 'PTFE (Teflon)', group: 'Plastic', stiffness: 0.5, density: 2200, loss: 0.08 },
    // Common counterparts for metal/plastic objects to land on or be hit with.
    { id: 'wood', label: 'Wood (hardwood table)', group: 'Other', stiffness: 11, density: 700, loss: 0.015 },
    { id: 'concrete', label: 'Concrete (floor)', group: 'Other', stiffness: 30, density: 2400, loss: 0.02 },
    { id: 'glass', label: 'Glass', group: 'Other', stiffness: 70, density: 2500, loss: 0.001 },
    { id: 'rubber', label: 'Rubber / hand (soft)', group: 'Other', stiffness: 0.01, density: 1100, loss: 0.3 },
];
export function materialById(id) {
    return MATERIALS.find((m) => m.id === id);
}
//# sourceMappingURL=materials.js.map