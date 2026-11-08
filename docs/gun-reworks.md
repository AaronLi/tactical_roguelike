# Gun model reworks

What's been rebuilt from references, and when, so the next guns to rework can be picked: every gun in `G.WEAPON_LIST` that isn't
listed here comes first (by tier, then name), then the oldest rows. The process is the `rework-gun` skill
(`.claude/skills/rework-gun/SKILL.md`). Add a row when a rework lands.

The rows up to 2026-10-30 were reconstructed from git history, so a date is when the work was committed, and a shared
date doesn't say which came first. `traced`: from a photo. `by eye`: built looking at photos.

| Gun id | Date | How | Commit | Reference |
| --- | --- | --- | --- | --- |
| p90 | 2026-10-21 | traced | b52a90d | FN side view; the model itself dates from 2026-10-19 |
| derringer | 2026-10-25 | traced | 31aec41 | "American Corp. Derringer M1.jpg" |
| aug | 2026-10-25 | traced | 31aec41 | see README |
| aug9 | 2026-10-25 | traced | 31aec41 | shares the AUG's trace |
| g36 | 2026-10-25 | traced | 31aec41 | see README |
| qbz95 | 2026-10-25 | traced | 31aec41 | see README |
| scar | 2026-10-25 | traced | 31aec41 | see README |
| scarl | 2026-10-25 | traced | 31aec41 | shares the SCAR's trace |
| vector | 2026-10-25 | traced | 31aec41 | "Kriss-Vector-CRB.jpg" |
| qbz192 | 2026-10-25 | by eye | 31aec41 | photos |
| mcx | 2026-10-25 | by eye | 31aec41 | Wikimedia Commons photos |
| mpx | 2026-10-25 | by eye | 31aec41 | Wikimedia Commons photos |
| p9 | 2026-10-30 | traced | 12674e8 | "Walther P99-JH01.jpg" |
| tx22 | 2026-10-30 | traced | 12674e8 | "TX22 with magazine.jpg" |
| ppk | 2026-10-30 | traced | 12674e8 | "Walther PPK .32 379804k R DSC 7786.jpg" |
| b92 | 2026-10-30 | traced | 12674e8 | "Beretta 92FS hand gun.jpg" |
| g18 | 2026-10-30 | traced | 12674e8 | "Glock 18C.jpg" |
| m1911 | 2026-10-30 | traced | 12674e8 | "Remington Rand M1911A1 (6825681098).jpg" |
| mac10 | 2026-10-30 | traced | 12674e8 | "MAC10.jpg" |
| usp | 2026-10-30 | traced | 12674e8 | "First-year H&K USP 9mm (32415150000) modified.png" |
| rev | 2026-10-30 | traced | 12674e8 | "Smith & Wesson .357 Model 686 Plus.jpg" |
| deagle | 2026-10-30 | traced | 12674e8 | "Desert-Eagle-p1030134.jpg" |
| fiveseven | 2026-10-30 | traced | 12674e8 | "FN Five Seven (cropped).jpg" |
| thor | 2026-10-30 | traced | 12674e8 | IMFDB "THOR_.45-70.jpg"; the EAA/Tanfoglio Thor |
| f2 | 2026-10-30 | traced | 05b7420 | "FAMAS-G2-IMG 8894-white.jpg" (a FAMAS G2; first traced as an F1 in 6390c31) |
| crossbow | 2026-10-30 | by eye | bae22cf | "Crossbow TenPoint Stealth SS.png", "Horton Hunter Supreme by IvE.jpg": no level side photo, so proportions from the TenPoint's specs |
| dbl | 2026-10-30 | traced | 2068cbc | "ИЖ-43Е (1).jpg" (an IZH-43E) |
| pump | 2026-10-30 | traced | 32272b8 | "Remington 870 Wmaster.jpg" (a Wingmaster) |
| aks74u | 2026-10-30 | traced | c665baf | "AK74andAKS74U.jpg", cross-checked against "Stepanov AKS-74Us.jpg" and "AKSU-74.jpg" |
| ar9 | 2026-10-30 | traced | feb9d29 | "AR Colt 9mm left.jpg" (the Colt 9mm SMG's receiver pair; the Glock magazine goes in the same well) |
| gm6 | 2026-11-01 | traced | (new gun) | IMFDB "GepardM6.jpg" (the maker's studio shot); the front end checked against Commons "Sniper rifle (18218366812) (GM6 Lynx).jpg" |
| mp5 | 2026-11-06 | traced | (this commit) | authored in Blender (models/mp5_kit.py): Commons "HK MP5 noBG.png" (an A3, 0.576 mm/px from its 660 mm), the A2 stock from "MP5 in U.S. Ordnance Museum.jpg" (issue #30). Reworked again: the rear sight is HK's rotary drum between its two protective ears (the drum's V notch and apertures, the settings marked), the cocking lever is the HK slap handle (left of the tube at 10 o'clock, folded forward, with the notch at the slot's rear: `info.handle.lock`) with the slap reload (js/vmanim.ts slapClip), and the FDE slim forend and the tri-rail "railed front" are drawn (models/parts/handguard/mp5_slim, mp5_trirail; models/mp5_parts.py) |
| mp5sd | 2026-11-06 | traced | (this commit) | authored in Blender (models/mp5_kit.py): the MP5's receiver; the front from "MP5SD.JPG" and "MP5SD_EP.jpg", its length from HK's figures (the SD2 790 mm to the A2's 680). Reworked again with the MP5: the drum sight, the slap handle and its reload |
| m4 | 2026-11-06 | by eye | (this commit) | authored (models/ar_kit.py): the bolt catch added to the AR lower: a paddle about 10 x 25 mm on a roll pin in a raised boss behind the well, a serrated pad 3.8 mm proud (the AR-15 / M4 left-side photos the AR family cites); its own part_catch node, worked in the reload from empty (js/vmanim.ts release).  |
| ar9 | 2026-11-06 | by eye | (this commit) | authored: the bolt catch added to the AR lower: a paddle about 10 x 25 mm on a roll pin in a raised boss behind the well, a serrated pad 3.8 mm proud (the AR-15 / M4 left-side photos the AR family cites); its own part_catch node, worked in the reload from empty (js/vmanim.ts release).  |
| sr25 | 2026-11-06 | by eye | (this commit) | authored: the bolt catch added to the AR lower: a paddle about 10 x 25 mm on a roll pin in a raised boss behind the well, a serrated pad 3.8 mm proud (the AR-15 / M4 left-side photos the AR family cites); its own part_catch node, worked in the reload from empty (js/vmanim.ts release).  |
| hk416 | 2026-11-06 | by eye | (this commit) | recipe AR receiver: the bolt catch added to the AR lower: a paddle about 10 x 25 mm on a roll pin in a raised boss behind the well, a serrated pad 3.8 mm proud (the AR-15 / M4 left-side photos the AR family cites); its own part_catch node, worked in the reload from empty (js/vmanim.ts release). Also the magazine release (right) and an ambidextrous selector |
| m27 | 2026-11-06 | by eye | (this commit) | recipe AR receiver: the bolt catch added to the AR lower: a paddle about 10 x 25 mm on a roll pin in a raised boss behind the well, a serrated pad 3.8 mm proud (the AR-15 / M4 left-side photos the AR family cites); its own part_catch node, worked in the reload from empty (js/vmanim.ts release). Also the magazine release and an ambidextrous selector |
| br3 | 2026-11-06 | by eye | (this commit) | recipe AR receiver: the bolt catch added to the AR lower: a paddle about 10 x 25 mm on a roll pin in a raised boss behind the well, a serrated pad 3.8 mm proud (the AR-15 / M4 left-side photos the AR family cites); its own part_catch node, worked in the reload from empty (js/vmanim.ts release). Also the magazine release and the selector (left) |
| mk14 | 2026-11-06 | by eye | (this commit) | recipe AR receiver: the bolt catch added to the AR lower: a paddle about 10 x 25 mm on a roll pin in a raised boss behind the well, a serrated pad 3.8 mm proud (the AR-15 / M4 left-side photos the AR family cites); its own part_catch node, worked in the reload from empty (js/vmanim.ts release). Also the magazine release and the selector (left) |
| ar9 | 2026-11-07 | by eye | (this commit) | authored (models/ar9, from rt-models 4388465): a 6.7" M-LOK handguard (0.170 m) in place of the carbine handguard and the A2 front sight base, a low-profile gas block under it (0.140 m ahead of the upper), the KAC folding front sight on the front of its top rail; hgMax 0.17 -> 0.1844 from the anchors |
