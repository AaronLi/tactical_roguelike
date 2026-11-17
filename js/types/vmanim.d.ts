// Types js/vmanim.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/vmanim.ts.

/** Where a gun's round shows when it is checked: at the back of the cylinder, the open breech, the ejection port, the top or right of the receiver. */
type VmChamberSide = 'cyl' | 'breech' | 'face' | 'port' | 'top' | 'right';
