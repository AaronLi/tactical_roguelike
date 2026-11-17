# Firearm suppressors: physics and operating principles

Scope note: explanatory level only (no dimensions or manufacturing detail). Source quality is flagged per bullet: **[A]** = peer-reviewed / government / military briefing, **[B]** = industry engineer or independent test lab, **[C]** = encyclopedic, trade press, retailer or vendor (use for concepts, treat numbers as approximate). Decibel figures from different sources are not directly comparable (different microphone positions, weighting, peak vs energy metrics).

## 1. What are the distinct components of gunshot sound, and roughly how loud is each?

### Takeaway
A gunshot is several sounds: the muzzle blast ("thump", the dominant source at the gun, roughly 155-170 dB peak near the muzzle), the ballistic shock wave of a supersonic bullet ("crack", roughly 145-152 dB peak near the flight path and barely fading with range downrange), plus action/port noise that is minor unsuppressed but can become the loudest thing at the shooter's ear once the muzzle is suppressed. A suppressor only addresses the first.

### Cited Findings
**Component list**
- NIOSH lists the components as: trigger pull, primer ignition, powder combustion, the bullet's exit from the muzzle (muzzle blast), an N-shaped ballistic shock wave from supersonic projectiles, and the noise of any cycling mechanism on semi-auto/auto guns. [A] — [Murphy et al., NIOSH/ASA Proc. Mtgs. Acoust. 33, 040004 (2018)](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Navy (NSWC Crane) briefing frames the signature as "Crack - Thump": crack = shockwave created by the bullet; thump = muzzle blast, the product of hot gases escaping the muzzle. [A] — [Cramer, NSWC Crane / NDIA 2009](https://ndia.dtic.mil/wp-content/uploads/2009/infantrysmallarms/thursdaysessionxi8453.pdf)
- Dater (Gemtech founder) reduces it to two sources: (1) sudden release of hot high-pressure propellant gas from the bore, and (2) the bullet-flight ballistic crack, "generated outside the weapon system" and not addressable by a suppressor. [B] — [Dater, Firearm Sound Briefing, 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)

**Muzzle blast levels and character**
- Unsuppressed levels 1 m left of muzzle: SIG P229 .357 SIG 162-163 dB; P229 .40 S&W 161-162 dB; P228 9 mm 159-162 dB; AR-15 .223 162-163 dB (M4: 164 dB). [B] — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- NIOSH test of 4 pistols, 9 rifles, 1 shotgun: unsuppressed peak levels ranged 143-166 dB peak SPL across measurement positions; elsewhere the authors note most rifles, shotguns and some pistols can exceed 160-170 dB peak SPL. [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Two bolt-action rifles (Remington 788, .300 Winchester) measured 169 and 171 dB peak SPL; even low-power .22 LR handguns exceed 160 dB. [C] — [Wikipedia, Silencer (firearms)](https://en.wikipedia.org/wiki/Silencer_(firearms))
- The muzzle blast lasts about 3-5 ms, travels at the speed of sound, is strongest in the direction the barrel points and decreases with off-axis angle ("highly directional"). A handgun's blast is quieter and shorter than a rifle's. [A] — [Maher, Montana State Univ., 2006](https://fdn.montana.edu/rmaher/publications/maher_aac_0406.pdf)
- SA80 (5.56 mm) rifle to the side: 161 dB(C) peak at 0.3 m, falling to 128 dB(C) at 32 m; about 137 dB(C) at ~20 m and 135 dB(C) at ~25 m. [A] — [Paddan & Lower, Applied Acoustics 109 (2016) 61-68](http://dx.doi.org/10.1016/j.apacoust.2016.02.003)
- Free-field rule of thumb: each doubling of distance reduces level by 6 dB (inverse square law). [B] — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)

**Ballistic crack levels and character**
- Bullet-flight noise measured 55 yd downrange, 1 m to the side of the flight path (suppressed / unsuppressed): .308 152.6 / 151.9 dB; .223 M855 148.5 / 148.1 dB; .22 LR high-velocity 143.5 / 144.1 dB. Subsonic or standard-velocity .22 LR: "no measurable or perceived sound". [B] — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- SA80 downrange: highest peak level from a single round was 151 to 148 dB(C) at 50 m to 300 m, i.e. it "varied little if at all with distance", and was caused by the bullet's shock wave; still above 145 dB(C) at 300 m. [A] — [Paddan & Lower 2016](http://dx.doi.org/10.1016/j.apacoust.2016.02.003)
- The shock wave is a cone trailing the bullet; Mach angle = arcsin(1/M). At 3,000 ft/s, M = 2.67 and the angle is about 22 degrees; near Mach 1 the angle approaches 90 degrees. The cone widens as the bullet slows downrange, and far from the trajectory the shock may be undetectable against ambient noise. [A] — [Maher 2006](https://fdn.montana.edu/rmaher/publications/maher_aac_0406.pdf)
- For a typical bullet a few centimetres long the N-wave's two shocks are less than ~200 microseconds apart (a very short, high-frequency event). [A, via search snippet of a Maher paper, not read in full] — [Maher, AES conf. 2008](https://exponent.montana.edu/rmaher/publications/maher_aesconf_0608_1-8.pdf)
- A subsonic rifle or handgun produces only the muzzle blast signal; the subsonic bullet makes no significant flight sound. [A] — [Maher 2006](https://fdn.montana.edu/rmaher/publications/maher_aac_0406.pdf)

**Action / port noise**
- For semi-auto/auto firearms the exhaust gas used to cycle the action "can become the dominant noise source for the shooter when firing a suppressed weapon"; "the suppressor does not reduce any of the noise produced by the gas ejection port". On suppressed M4-type rifles the right-ear level was about 8-12 dB higher than the left ear, attributed to the right-side ejection port. [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Lobarinas et al. (cited by NIOSH): AR-15 suppressor peak reductions were 20-25 dB at 1 m from the muzzle, 15-25 dB at the left ear, but only 6-9 dB at the right ear (port side). [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Action type matters: locked-breech (manual) guns vent nothing; direct-impingement guns vent unlocking gas into the bolt carrier; piston systems vent from the barrel port ahead of the muzzle and suppressor, are loudest at the shooter's ear and "cannot be addressed by a suppressor". With the same suppressor and M855 ammo, relative to a 14.5 in M4 (1 m left of muzzle): HK416 +5 dB, SIG 551 +14 dB, Steyr AUG +9 dB, bolt action same, 20 in AR-15 -2 dB. [B] — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)

### Inferences
- For a game: model at least three emitters. (1) Muzzle blast: at the gun, directional (louder forward), 6 dB per distance doubling, the only term a suppressor scales. (2) Crack: emitted along the bullet path inside a cone, only if muzzle velocity is supersonic, roughly constant ~145-150 dB near the flight path regardless of range, heard only by listeners the bullet passes. (3) Action/port noise: at the gun, small, unaffected by the suppressor, relevant mostly to semi/full-auto.
- A 170 dB peak corresponds to roughly 6.3 kPa (~0.9 psi) overpressure (computed from 20 micropascal reference, 20*log10). Tiny compared with the thousands of psi in the bore, which shows how much of the energy dissipates in the first metre.

### Gaps
- No reliable, isolated measurement found for mechanical action noise (bolt/slide clatter, hammer fall) or bullet impact noise in dB. Trade sources assert the action of a suppressed subsonic gun is clearly audible nearby, but I found no measured figure. Treat any number as a design choice.
- Two briefings contain dB arithmetic slips: Cramer says "3 dB represents a doubling in SPL" and Dater gives dB = 10*log10(P1/P0) for pressure. Correct physics: doubling sound pressure = +6 dB; doubling energy = +3 dB. Do not copy those lines.

## 2. How does a suppressor reduce muzzle blast?

### Takeaway
The blast is the abrupt release of high-pressure gas at bullet exit; a suppressor gives that gas a larger volume to expand into, cools it, and stretches its release over a longer time via baffles, trapping and turbulence, so the pressure step that reaches open air is much smaller. Measured reductions are typically ~20-30 dB at the side/muzzle position (range ~3-35 dB depending on gun, ammo, and where you stand).

### Cited Findings
- "The sound is caused by the sudden release of high pressure propelling gases at the moment of bullet exit (uncorking). The suppressor significantly reduces the pressure of these gases before they are released into the atmosphere." Pressure is reduced by (1) increasing volume and decreasing temperature (combined gas law P1V1/T1 = P2V2/T2) and (2) extending the time curve: dissipating energy over a longer interval through gas trapping or turbulence. [B] — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- "A series of baffles and expansion chambers divert the expanding gases and break up the initial shock wave substantially reducing the sound energy." [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Structure: a tube with internal baffles and a bore hole for the bullet; gas takes a longer, winding path, slowing it and spreading its energy over more surface area. Typically at least 4 and up to ~15 chambers; a larger first expansion ("blast") chamber at the muzzle lets gas slow before the baffles. Baffle bores are slightly larger than the bullet to avoid strikes. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))
- Patent language for the same idea: gas is diverted outward by a baffle into an expansion chamber and returns to the central passage "at a lower velocity and pressure"; baffle walls "entrap and slow some of the blast gas so that the blast gas exits the suppressor at a lower velocity". [B] — [US 12,152,851](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12152851); [US 10,119,779](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10119779)
- Two construction families: stacked baffles or a single machined "monocore"; both work by controlling gas expansion. [C] — [Bass Pro 1Source](https://1source.basspro.com/news-tips/shooting/36488/how-suppressors-work)
- Measured effect, NIOSH (14 firearms): peak SPL reduced 3-28 dB and A-weighted equivalent energy 2-24 dB depending on position; suppressed peaks were 121-150 dB (low-velocity ammo) and 121-151 dB (high-velocity). Predictive margins: about 11-30 dB reduction in A-weighted energy except near the line of fire. Greater reduction to the side than to the rear. [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Prior literature summarised by NIOSH: 7-35 dB (Skochko & Greveris, Army); 8-25 dB at the shooter's ear and 4-32 dB at 10 m to the side (Paakkonen et al.); 17-24 dB peak near the ear (Murphy et al. 2018, Int. J. Audiol.); up to ~40 dB peak reduction combining a suppressor with subsonic ammunition. [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Reduction is frequency-dependent: greatest in low-to-mid bands (e.g. 250-2,000 Hz to the side for a .338 rifle with low-velocity ammo). [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Still loud: suppressed gunshots regularly meter above 130 dB; MIL-STD-1474D uses 140 dB peak as the impulse limit; NIOSH concludes hearing protection should still be worn with a suppressor because suppressed peaks were not all below 140 dB. Major manufacturers circa 2009 advertised nearly identical peak SPLs of ~137 dB. [A/C] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf); [Cramer 2009](https://ndia.dtic.mil/wp-content/uploads/2009/infantrysmallarms/thursdaysessionxi8453.pdf); [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))
- Heat goes into the can: 100 rounds of full-auto 5.56 raises suppressor temperature to about 800 F, at which 300-series stainless retains roughly 62% of room-temperature yield strength. [B] — [Dater & Wong, NDIA 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)
- Durability context: baffles erode from heat and gas, worse at high rates of fire; best rifle suppressors claim service life above 30,000 rounds. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))

### Inferences
- A 20-30 dB cut is a 10x-30x reduction in peak sound pressure but, because loudness perception is roughly logarithmic, it sounds like "much quieter gunshot", not silence. A suppressed centrefire rifle (~135-145 dB at the muzzle) is still louder at source than a jackhammer.
- Larger internal volume, more baffles and more gas trapping give more suppression but more weight, length, heat retention and back pressure (see section 6): the core design tradeoff, usable as a game stat triangle (suppression vs size/weight vs back pressure).

### Gaps
- PEW Science's detailed methodology and rankings are largely members-only; I could not extract their Suppression Rating scale definitions. Their public remarks stress that peak dB alone poorly predicts perceived loudness (waveform shape/duration and inner-ear response matter). — [PEW Science](https://pewscience.com/sound-signature-reviews-free/sss-6-36-griffin-explorr-ex3-savage-308)

## 3. What is the muzzle pressure/temperature at uncorking, and how does it relate to sound?

### Takeaway
Bore pressure at bullet exit ("uncorking") is thousands of psi for a rifle and rises steeply as barrels get shorter; unsuppressed loudness tracks uncorking pressure almost perfectly, which is why short barrels are louder and harder on suppressors.

### Cited Findings
- Dater & Wong measured 5.56 M855 bore pressure with a piezo sensor near the muzzle of a barrel cut down 1 inch at a time from 24 in to 5 in. At 15 in barrel length the uncorking pressure averaged 7,878 psi (6 shots, range 7,000-8,110, SD 396). Pressure near the chamber (3 in port) averaged 55,744 psi (SAAMI max for .223: 55,000 psi). [B] — [Dater & Wong, NDIA 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)
- Conclusions: uncorking pressure "increases exponentially with decreasing barrel length"; unsuppressed SPL also increases exponentially with decreasing barrel length; pressure in a suppressor's entrance chamber rises proportionately with uncorking pressure. [B] — [Dater & Wong 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)
- "The bore pressure at the instant of bullet uncorking correlated almost perfectly with the non-suppressed sound pressure level (dBA)." [B] — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- Inside the suppressor's first chamber (M855): about 1,978-2,000 psi on a 14.5 in barrel vs 2,990-3,000 psi on a 10.5 in barrel, i.e. roughly 50% higher on the short barrel; one compact stainless can swelled at the blast chamber after sustained full-auto on a 10.5 in gun but not on a 14.5 in M4. [B] — [Dater & Wong 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)
- As barrels shorten, "weapon reliability decreases while sound and flash increase"; M855 velocity peaks in a 20 in barrel and drops below 2,500 ft/s under about 10 in. [B] — [Dater & Wong 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)
- .22 LR and .45 ACP are described as the easiest cartridges to suppress (low pressure, subsonic). [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))

### Inferences
- Order of magnitude for a game model: rifle uncorking pressure ~5,000-10,000+ psi on carbine-length barrels, dropping to ~2,000-3,000 psi inside the first chamber of a suppressor, then to a small fraction of that at the suppressor's exit. Barrel length should be a strong multiplier on both unsuppressed loudness and suppressor stress/wear.
- Low-pressure pistol and rimfire cartridges uncork at far lower pressures, consistent with their being easy to suppress with small cans.

### Gaps
- No citable numeric uncorking pressure for pistol cartridges (9 mm, .45 ACP) was found. The full Dater barrel-length table (pressure, velocity, dB at each inch) exists only as chart images in the slides and SADJ article; I could extract only the 15 in data point.
- No reliable sourced figure for propellant gas temperature at the muzzle was found. Commonly repeated values (on the order of 1,000-2,000+ C) are unsourced here; treat as unverified.

## 4. Why can't a suppressor remove the supersonic crack? Subsonic ammunition and the transonic boundary

### Takeaway
The crack is a shock wave created by the bullet itself along its whole supersonic flight path, outside and downstream of the suppressor, so nothing at the muzzle can affect it; only keeping the bullet below the local speed of sound (about 1,087 ft/s at 32 F, 1,118 ft/s at 60 F, 1,139 ft/s at 80 F) removes it, at a large cost in energy and range.

### Cited Findings
- The N-wave "is unaffected by the presence of the suppressor because it is generated by the supersonic bullet." Suppression of supersonic rounds was less than of subsonic rounds even when the N-wave was digitally removed from the recordings. [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Direct measurement: crack level beside the flight path was essentially identical suppressed vs unsuppressed (.308: 152.6 vs 151.9 dB; .223: 148.5 vs 148.1 dB). [B] — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- Peak levels were not attenuated significantly within about 50 degrees around the axis of fire, presumably due to the ballistic shock wave, while 30 dB reductions were seen to the side and rear (Paakkonen, cited). [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Crane hypothesis: suppressors are now efficient enough to push muzzle-blast SPL below the SPL of the bullet's crack. Two suppressors that operators judged very different in loudness measured within 0.3 dB of each other. [A] — [Cramer 2009](https://ndia.dtic.mil/wp-content/uploads/2009/infantrysmallarms/thursdaysessionxi8453.pdf)
- Speed of sound vs air temperature: 0 F 1,051 ft/s; 32 F 1,087; 60 F 1,118; 80 F 1,139; 100 F 1,160 (proportional to the square root of absolute temperature). [B] — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- About 1,140 ft/s (350 m/s) at 70 F at sea level; on the NIOSH test day c was 338 m/s (1,109 ft/s). In that study the .22 LR and .45 ACP "high-velocity" loads were in fact not supersonic and showed almost no difference from low-velocity loads. [C/A] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms)); [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Subsonic costs: dropping .308 Win from ~2,700 ft/s to ~950 ft/s cuts muzzle energy by a factor of about 8. Typical subsonic loads: 9 mm 147 gr at 900-980 ft/s; .300 Blackout 190-220 gr at about 1,020-1,070 ft/s (~480-560 ft-lbf); .300 Whisper up to 250 gr at ~980 ft/s. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))
- Subsonic .308 loads metered 10-12 dB below suppressed supersonic loads (121-137 dB). [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))
- Integral suppressors can port the barrel to bleed gas so standard supersonic ammunition exits subsonic (e.g. MP5SD); the Soviet VSS (9x39 mm subsonic) is cited as a simple, highly effective integral design. [C/B] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms)); [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- Retail sources put a suppressed supersonic rifle's overall report in the 135-145+ dB range and suppressed subsonic 9 mm around 125-135 dB (not standardised measurements). [C] — [Silencer Shop](https://silencershop.com/blog/what-does-gunshot-sound-like); [Popular Suppressors](https://popularsuppressors.com/articles/subsonic-vs-supersonic-suppressor-ammo/)

### Inferences
- The commonly quoted "1,125 ft/s (343 m/s)" corresponds to about 68 F (20 C); it sits between Dater's 60 F and 80 F table values. Approximation: c ≈ 331 + 0.6 x T(C) m/s. Loads near the boundary (e.g. 1,050-1,100 ft/s) can be subsonic on a hot day and crack on a cold one; a game could key "subsonic" off ammo type with optional cold-weather/altitude flavour.
- Because bullets slow in flight, a supersonic round can go subsonic downrange; the crack is only produced along the supersonic portion of the path.
- Gameplay mapping: suppressor + supersonic = shooter's position is quieter but everyone the bullet passes still hears a sharp crack; suppressor + subsonic = only reduced muzzle blast and action noise, but lower damage/range and more drop.

### Gaps
- Did not find a rigorous source describing transonic instability/accuracy effects for bullets crossing Mach 1; omitted.

## 5. First round pop, and wet vs dry suppression

### Takeaway
The first shot through a suppressor that is full of fresh air is louder because oxygen in the can lets propellant gas keep burning inside it; later shots fire into oxygen-depleted gas. Adding a small amount of liquid/gel ("wet" firing) cools the gas by vaporising the medium and displaces air, buying a few extra dB for a few shots, mainly on pistol and subsonic hosts.

### Cited Findings
- NIOSH: suppressors not recently fired "often exhibit a louder impulse on the first shot" ("first pop"). "The oxygen-depleted gases within the suppressor canister are thought to diminish the combustion of powder within the can, leading to reduced levels after the first shot." A pause between shots lets air exchange back in. Suppressed shot-to-shot peak variability was higher than unsuppressed. [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- PEW Science: before firing, the suppressor is filled with ambient air that "supports ancillary combustion during the first shot"; first-round signatures always differ from later ones as the atmosphere in the silencer changes; FRP is not always visible in peak pressure alone; high-flow designs may show little perceptible FRP. [B] — [PEW Science SSS.6.36](https://pewscience.com/sound-signature-reviews-free/sss-6-36-griffin-explorr-ex3-savage-308)
- Wet suppressors use water, oil, grease or gel to cool the gas and reduce its volume; water is the most effective because of its high heat of vaporisation, but it runs out or evaporates. The effect lasts only a few shots; rifle suppressors are often dry again after 1-3 shots. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))
- Trade press: wet firing typically adds about 3-10 dB of reduction versus the same suppressor dry, and a small amount of water or wire-pulling gel greatly reduces first round pop; liquids are incompressible so overfilling is hazardous; it is generally used with pistol/subsonic loads, and a supersonic crack negates the benefit. [C] — [RECOIL](https://www.recoilweb.com/suppressor-enhancement-making-a-can-quieter-173840.html); [Gun Digest](https://gundigest.com/gear-ammo/suppressors/making-cans-quieter); [Capitol Armory](https://capitolarmory.com/blog/what-is-first-round-pop.html)
- Wipes (consumable elastomer discs the bullet punches through) seal gas better but typically last no more than about five shots and can reduce accuracy; mesh packing may last hundreds to thousands of shots, steel wool under ten. Modern designs mostly avoid wipes and packing. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))

### Inferences
- Game mechanic candidates: (a) first shot after a pause is a few dB louder than follow-ups; (b) a consumable "ablative" that improves suppression for the next handful of shots on pistol-calibre/subsonic weapons only; (c) wipes as a short-lived, accuracy-penalising high-suppression option.

### Gaps
- No peer-reviewed quantification of FRP magnitude found; enthusiast sources suggest a few dB, but I have no citable figure. The 3-10 dB "wet" benefit is trade-press, not lab data.
- A vendor claim that CO2 purging eliminates FRP exists only as a forum/vendor post and is unverified. — [Sniper's Hide thread](https://snipershide.com/shooting/threads/looking-for-popstop-beta-testers-eliminates-frp-and-frf.6870026)

## 6. Secondary effects of suppressors

### Takeaway
Besides sound, a suppressor cuts flash and recoil and slightly raises velocity, but adds length, weight and heat (mirage), shifts point of impact, and on gas-operated guns raises back pressure, which speeds the action, fouls the gun and blows gas at the shooter. "Low back pressure / flow-through" designs trade some suppression for fewer of those side effects.

### Cited Findings
**Flash**
- Suppressors reduce or eliminate muzzle flash by containing and cooling the gas, which also prevents unburned powder from igniting in open air. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))

**Recoil**
- Propellant gas contributes about 30-50% of recoil velocity; suppressors reduce recoil about 15% for low-velocity pistol calibres and 20-30% for high-velocity calibres, and the added 300-500 g of mass also helps. Some designs raise back pressure enough to act like a muzzle booster and increase felt recoil. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))

**Velocity**
- In NIOSH testing, "in most cases, the suppressors increased the bullet velocity by a fraction of a percent to as much as 6%." [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)

**Back pressure, cyclic rate, gas blowback**
- Back pressure influences cyclic rate, bolt-group speed, ejection and operator-perceived "gas in the face". [B, from search snippet; page returned HTTP 503 on fetch] — [Thunder Beast Arms, back pressure method](https://thunderbeastarms.com/tech/backpressure/)
- Excess back pressure speeds the bolt carrier and bolt, raising cyclic rate; it increases carbon fouling so the gun chokes sooner, reduces reliability in dust/humidity, accelerates wear, causes flinch, and under night vision the gas cloud near the face reduces visibility. Flow-through designs (HUXWRX) and low-back-pressure lines (SilencerCo Velos LBP) target this. [C] — [The Firearm Blog, Dec 2024](https://www.thefirearmblog.com/blog/low-back-pressure-suppressors-do-they-really-make-a-difference-44817520)
- Vendor-published data point: one 2025 rifle suppressor produced a 50% increase in back pressure and a 5% increase in cyclic rate; a competitor 48% and 3%. [C, vendor data] — [Athlon Outdoors on TBAC Spiro](https://athlonoutdoors.com/article/thunderbeasts-new-spiro-suppressor/)
- In autoloaders, higher back pressure can blow propellant gas back toward the shooter's face at ejection; cooling inside the can condenses most lead vapour there, though back pressure can offset that benefit on autoloaders. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))
- Bolt/manual actions have no such issue since no gas is diverted to cycle the action; gas guns may need tuning when suppressed. [C] — [The Firearm Blog](https://www.thefirearmblog.com/blog/low-back-pressure-suppressors-do-they-really-make-a-difference-44817520)
- Back pressure also shows up acoustically: port-side ear levels 8-12 dB above the off-side ear on suppressed AR-pattern rifles. [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)

**Point of impact (POI) shift**
- Adding a suppressor almost always changes point of impact; one shooter's example was about 2 in low and 1.5 in right at 100 yd, another suppressor showed no measurable shift; with modern mounts the shift is generally repeatable, so the gun can be re-zeroed for the suppressed state. [C, anecdotal] — [OutdoorHub](https://www.outdoorhub.com/?p=470751)

**Size, weight, heat, mirage**
- Size range examples: a disposable Navy 9 mm pistol suppressor 150 mm x 45 mm; a .50 BMG suppressor 509 mm x 76 mm; typical added mass 300-500 g. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))
- About 800 F after 100 rounds of full-auto 5.56. [B] — [Dater & Wong 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)
- Hot suppressors heat the air above them, producing mirage that distorts the scope image; as few as 2-3 shots can produce it in the right conditions; insulating covers are the usual mitigation. [C, manufacturer/retailer] — [SilencerCo Learning Center](https://silencerco.com/?p=1192170); [Silencer Central](https://www.silencercentral.com/blog/top-reasons-to-consider-a-suppressor-cover/)

### Inferences
- Suggested attachment stat set: sound (muzzle term only), flash (strong reduction), recoil (-15% pistol, -20 to -30% rifle), velocity (+0 to few %), handling/ADS penalty from length and weight, heat build-up per shot (mirage/accuracy penalty for scoped fire, burn hazard), and for gas-operated autos: cyclic rate up a few percent, faster fouling/malfunction chance, optional shooter "gas" penalty. A "flow-through" suppressor archetype would have lower sound reduction but none of the gas penalties.

### Gaps
- No controlled, peer-reviewed study found on POI shift magnitude or on cyclic-rate change across weapon types; figures above are vendor or anecdotal.
- No sourced quantitative flash-reduction metric found.

## 7. How is suppressed fire perceived at distance, and how does it affect locating the shooter?

### Takeaway
Listeners locate a shooter from the muzzle blast ("thump"), not the crack; the crack arrives first and points at the bullet's path, not the gun. A suppressor weakens or removes the thump, so downrange listeners hear mostly a crack that misleads them (errors of 90-180 degrees are reported), while listeners to the side or rear hear a much quieter, less gunshot-like sound at much shorter range.

### Cited Findings
- "The crack arrives at the observer first, followed by the thump. The crack points at the path of the bullet. The thump locates the shooter. Soldiers are trained to ignore the crack, and wait for the thump." [A] — [Cramer 2009](https://ndia.dtic.mil/wp-content/uploads/2009/infantrysmallarms/thursdaysessionxi8453.pdf)
- The shock wave originates at a "detach point" on the trajectory, not at the firer; a casual listener hears the shock first and may look toward the detach point, mistaking it for the firer's direction. [A] — [Acoustics Today, July 2011](https://acousticstoday.org/issues/2011AT/Jul2011/files/basic-html/page25.html)
- Suppressed sound is often unrecognisable as a gunshot, and the ballistic crack can cause observers to misjudge the shooter's position, often by 90 to 180 degrees. Acoustic gunfire locators (e.g. Boomerang) use the ballistic crack to localise shots. [C] — [Wikipedia](https://en.wikipedia.org/wiki/Silencer_(firearms))
- Crack-thump delay grows with range: downrange of an SA80, the shock wave led the muzzle blast by 94 ms at 50 m and 507 ms at 300 m. [A] — [Paddan & Lower 2016](http://dx.doi.org/10.1016/j.apacoust.2016.02.003)
- Crack level near the flight path barely falls with range (151-148 dB(C) from 50 to 300 m), whereas muzzle blast to the side falls from 161 dB(C) at 0.3 m to 128 dB(C) at 32 m. [A] — [Paddan & Lower 2016](https://dx.doi.org/10.1016/j.apacoust.2016.02.003)
- If the muzzle points away from the listener such that the shock cone does not reach them, only the muzzle blast is heard, and it is reduced behind the gun. With no line of sight, the received sound is dominated by reflections and diffraction. [A] — [Maher 2006](https://fdn.montana.edu/rmaher/publications/maher_aac_0406.pdf)
- Suppressor reduction is greatest to the side, less to the rear, and small near the line of fire with supersonic ammunition. [A] — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- A listening experiment with M4 fire found significant differences between localisation accuracy for the muzzle blast and for the ballistic crack presented in isolation. [A, abstract/snippet only] — [Towson University thesis via MD-SOAR](https://mdsoar.org/handle/11603/2045)
- Human left-right localisation relies on inter-ear level and arrival-time differences; front/back and elevation rely on spectral cues, which are weak for brief impulses. [A] — [Cramer 2009](https://ndia.dtic.mil/wp-content/uploads/2009/infantrysmallarms/thursdaysessionxi8453.pdf)
- Military "crack-bang" technique: range is estimated from the delay between crack and muzzle report, and the muzzle report gives the bearing. [C] — [UNITAF manual](https://unitedtaskforce.net/handbook/block/1067/locating-a-sniper-using-crackbang-method)

### Inferences
- Detection radius: with 6 dB per distance doubling, a 20-30 dB reduction in muzzle blast shrinks the distance at which the blast reaches a given loudness by a factor of roughly 10-30 in ideal free-field conditions (each 6 dB halves the distance; 20 dB = 10x, 30 dB = ~32x). Real terrain, wind, absorption and background noise make the practical factor smaller and variable; a game value of "suppressed audible radius = 10-30% of unsuppressed" is defensible and conservative.
- Suggested detection model:
  - Listener hears the muzzle blast (within the suppression-scaled radius): knows a gun fired and gets an accurate bearing to the shooter.
  - Listener hears only the crack (bullet passed near them, supersonic ammo): alerted and knows they are under fire, but bearing is wrong or very uncertain (biased toward perpendicular to the bullet path); confidence improves with repeated shots.
  - Listener hears both: can estimate bearing (from thump) and range (from delay, ~0.3 s per 100 m at 5.56 velocities based on the SA80 data).
  - Subsonic + suppressed: no crack; only very nearby listeners hear the reduced blast, action noise and bullet impact; the sound may not be identified as gunfire.
  - Indoors/urban: reflections further degrade direction finding.
- Because the muzzle blast is directional (louder forward) and suppression is least effective forward, enemies behind/beside the shooter should be the least likely to detect a suppressed shot; the target area the most.

### Gaps
- The most relevant primary source, a US Army/DTIC report (AD1147939) with tables of detection ranges for suppressed vs unsuppressed M4 fire under three background-noise levels, returned HTTP 403 and could not be read. Its numbers would be the best anchor for detection distances. — [DTIC AD1147939](https://apps.dtic.mil/sti/pdfs/AD1147939.pdf)
- The NIOSH paper on N-wave auditory risk (Flamme & Murphy) also returned 403. — [CDC Stacks 217132](https://stacks.cdc.gov/view/cdc/217132)
- No measured data found on how far bullet-impact noise carries, or on human recognition rates of suppressed shots as gunfire (the Wikipedia claim is unquantified).
- The 90-180 degree mislocalisation figure is from Wikipedia without a primary source I could verify.
