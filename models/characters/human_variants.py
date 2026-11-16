# The human model's variants: ten men, ten women, each a face, a build, a height, colouring and hair. build_human.py makes
# one when HUMAN_VARIANT names it (m01..m10, f01..f10); build_variants.py makes them all and lays them out on a sheet.
# Every one is on the same skeleton (the game's): a build changes the flesh on it, and a height is a scale of the whole figure.
import copy

SKIN = {'fair': (0.66, 0.47, 0.40), 'light': (0.60, 0.42, 0.33), 'base': (0.55, 0.37, 0.28), 'sand': (0.60, 0.44, 0.31), 'tan': (0.48, 0.31, 0.21),
        'olive': (0.44, 0.31, 0.20), 'brown': (0.30, 0.19, 0.13), 'deep': (0.20, 0.12, 0.085), 'dark': (0.13, 0.08, 0.06)}
HAIR = {'black': (0.012, 0.011, 0.012), 'dark': (0.05, 0.035, 0.03), 'brown': (0.12, 0.07, 0.04), 'chestnut': (0.2, 0.09, 0.045), 'blond': (0.5, 0.36, 0.17),
        'red': (0.36, 0.11, 0.04), 'grey': (0.36, 0.36, 0.37), 'white': (0.62, 0.62, 0.62)}
EYES = {'dark': (0.03, 0.03, 0.035), 'brown': (0.09, 0.045, 0.02), 'blue': (0.1, 0.2, 0.36), 'green': (0.1, 0.22, 0.12), 'grey': (0.2, 0.24, 0.28)}

# The figure build_human.py makes with no variant named (m01 is the same): every figure is this with its own changes.
DEF = dict(name='average', sex='m', height=1.756, skin='base', hair_col='dark', iris='dark',
           # the trunk's width and depth by region (1 = the base figure), the bust's depth in metres, the limbs' girth
           w=dict(neck=1.0, shoulder=1.0, chest=1.0, waist=1.0, hip=1.0), d=dict(neck=1.0, shoulder=1.0, chest=1.0, waist=1.0, hip=1.0),
           bust=0.0, delt=1.0, arm=1.0, fore=1.0, thigh=1.0, calf=1.0,
           # the face: widths, how far the features stand out (1 = the base face), the chin's push forward in metres
           head_w=1.0, jaw=1.0, jaw_edge=1.0, chin=0.0, nose=1.0, nose_w=1.0, lips=1.0, brow=1.0, cheek=1.0, eye_x=0.0315, eye_open=1.0, browthick=1.0,
           hair='short', stubble=False)
# A woman's figure: what every f variant starts from (narrower in the shoulder and waist, lighter limbs, a softer face).
F = dict(height=1.63, w=dict(neck=0.86, shoulder=0.98, chest=0.92, waist=0.86, hip=1.04), d=dict(neck=0.9, shoulder=0.92, chest=0.9, waist=0.88, hip=1.0),
         bust=0.016, delt=0.9, arm=0.84, fore=0.85, thigh=0.99, calf=0.93,
         jaw=0.9, jaw_edge=0.4, nose=0.82, nose_w=0.9, lips=1.25, brow=0.35, eye_open=1.15, browthick=0.6, hair='ponytail')
MULT = {'delt', 'arm', 'fore', 'thigh', 'calf', 'head_w', 'jaw', 'jaw_edge', 'nose', 'nose_w', 'lips', 'brow', 'cheek', 'eye_open', 'browthick'}  # (a variant's figure multiplies its sex's)

def R(**k): return dict(**k)  # (a region table: only the regions that differ)
VARIANTS = {
    'm01': dict(name='average'),
    'm02': dict(name='heavy-set', height=1.80, skin='tan', hair_col='black', iris='brown', hair='buzz', stubble=True, w=R(neck=1.1, chest=1.08, waist=1.16, hip=1.06), d=R(chest=1.08, waist=1.22, hip=1.06),
                arm=1.1, fore=1.08, thigh=1.08, calf=1.05, jaw=1.08, head_w=1.03, nose_w=1.1, brow=1.2),
    'm03': dict(name='tall and lean', height=1.87, skin='light', hair_col='brown', iris='blue', hair='receding', w=R(neck=0.94, shoulder=0.97, chest=0.94, waist=0.92, hip=0.95), d=R(chest=0.93, waist=0.92, hip=0.95),
                delt=0.93, arm=0.9, fore=0.92, thigh=0.92, calf=0.93, head_w=0.96, jaw=0.92, nose=1.18, nose_w=0.9, lips=0.85, cheek=1.6, chin=0.002),
    'm04': dict(name='muscular', height=1.83, skin='deep', hair_col='black', iris='dark', hair='bald', w=R(neck=1.12, shoulder=1.04, chest=1.1, waist=1.02), d=R(neck=1.08, chest=1.1, waist=0.98),
                delt=1.13, arm=1.18, fore=1.1, thigh=1.08, calf=1.06, jaw=1.06, nose=0.95, nose_w=1.3, lips=1.35, brow=1.25, chin=0.002),
    'm05': dict(name='short and stocky', height=1.68, skin='brown', hair_col='black', iris='dark', hair='short', stubble=True, w=R(neck=1.06, chest=1.05, waist=1.1, hip=1.05), d=R(chest=1.05, waist=1.12),
                arm=1.08, fore=1.06, thigh=1.06, calf=1.06, jaw=1.1, head_w=1.04, nose_w=1.15, lips=1.1, cheek=1.3),
    'm06': dict(name='slim', height=1.72, skin='sand', hair_col='black', iris='dark', hair='full', w=R(neck=0.93, shoulder=0.97, chest=0.95, waist=0.93, hip=0.96), d=R(chest=0.94, waist=0.93),
                delt=0.94, arm=0.92, fore=0.94, thigh=0.95, calf=0.95, jaw=0.96, nose=0.8, nose_w=1.05, brow=0.6, cheek=1.5, eye_open=0.85, browthick=0.85),
    'm07': dict(name='older, a belly', height=1.75, skin='fair', hair_col='grey', iris='grey', hair='receding', stubble=True, w=R(chest=1.03, waist=1.2, hip=1.06), d=R(chest=1.04, waist=1.32, hip=1.05),
                arm=1.0, thigh=1.03, jaw=1.03, nose=1.1, nose_w=1.12, lips=0.85, brow=1.4, eye_open=0.88, browthick=1.25),
    'm08': dict(name='wiry', height=1.74, skin='olive', hair_col='black', iris='brown', hair='short', stubble=True, w=R(neck=0.97, chest=0.97, waist=0.94, hip=0.96), d=R(chest=0.96, waist=0.92),
                arm=0.96, fore=1.0, thigh=0.95, calf=0.97, head_w=0.98, jaw=0.97, nose=1.15, nose_w=1.0, cheek=1.7, brow=1.15, chin=0.003, browthick=1.3),
    'm09': dict(name='big and tall', height=1.91, skin='fair', hair_col='red', iris='green', hair='buzz', stubble=True, w=R(neck=1.1, shoulder=1.03, chest=1.08, waist=1.08, hip=1.05), d=R(chest=1.1, waist=1.1, hip=1.05),
                delt=1.08, arm=1.1, fore=1.08, thigh=1.08, calf=1.06, head_w=1.02, jaw=1.1, nose=1.05, lips=0.9, brow=1.3, chin=0.004),
    'm10': dict(name='athletic', height=1.79, skin='dark', hair_col='black', iris='dark', hair='hightop', w=R(neck=1.03, chest=1.03, waist=0.96), d=R(chest=1.03, waist=0.95),
                delt=1.05, arm=1.06, fore=1.03, thigh=1.03, jaw=1.0, nose=0.92, nose_w=1.22, lips=1.3, cheek=1.3, eye_open=1.05),
    'f01': dict(name='average', skin='light', hair_col='brown', iris='brown', hair='ponytail'),
    'f02': dict(name='athletic', height=1.70, skin='tan', hair_col='dark', iris='brown', hair='bun', w=R(shoulder=1.04, chest=1.03, waist=0.98), d=R(waist=0.96), bust=0.012,
                delt=1.1, arm=1.1, fore=1.05, thigh=1.04, calf=1.04, jaw=1.03, cheek=1.5, lips=0.95),
    'f03': dict(name='petite', height=1.56, skin='sand', hair_col='black', iris='dark', hair='bob', w=R(shoulder=0.97, chest=0.95, waist=0.95, hip=0.95), d=R(chest=0.95, waist=0.95, hip=0.96), bust=0.011,
                arm=0.93, fore=0.95, thigh=0.94, calf=0.95, jaw=0.96, nose=0.85, nose_w=1.05, cheek=1.4, eye_open=0.9),
    'f04': dict(name='strong, heavy', height=1.69, skin='deep', hair_col='black', iris='dark', hair='buzz', w=R(neck=1.1, shoulder=1.04, chest=1.1, waist=1.2, hip=1.1), d=R(chest=1.08, waist=1.22, hip=1.1), bust=0.02,
                delt=1.12, arm=1.18, fore=1.12, thigh=1.12, calf=1.08, jaw=1.08, head_w=1.02, nose_w=1.3, lips=1.15),
    'f05': dict(name='tall and lean', height=1.77, skin='fair', hair_col='blond', iris='blue', hair='bob', w=R(chest=0.97, waist=0.96, hip=0.96), d=R(chest=0.96, waist=0.95), bust=0.012,
                arm=0.95, thigh=0.95, calf=0.96, head_w=0.97, jaw=0.96, nose=1.12, nose_w=0.92, lips=0.9, cheek=1.6),
    'f06': dict(name='curvy', height=1.62, skin='brown', hair_col='black', iris='dark', hair='topbun', w=R(waist=1.02, hip=1.1), d=R(waist=1.04, hip=1.1), bust=0.024,
                arm=1.05, thigh=1.1, calf=1.04, jaw=1.0, nose_w=1.15, lips=1.2, cheek=1.2),
    'f07': dict(name='older', height=1.60, skin='fair', hair_col='grey', iris='grey', hair='pixie', w=R(chest=1.03, waist=1.14, hip=1.05), d=R(chest=1.03, waist=1.2, hip=1.04), bust=0.018,
                arm=1.03, thigh=1.03, jaw=1.03, nose=1.12, lips=0.75, brow=1.6, eye_open=0.85),
    'f08': dict(name='muscular', height=1.73, skin='olive', hair_col='black', iris='green', hair='ponytail', w=R(neck=1.08, shoulder=1.07, chest=1.07, waist=1.04), d=R(chest=1.05, waist=1.0), bust=0.012,
                delt=1.2, arm=1.22, fore=1.12, thigh=1.1, calf=1.08, jaw=1.08, jaw_edge=1.8, nose=1.08, lips=0.9, cheek=1.5, chin=0.002),
    'f09': dict(name='short and stocky', height=1.55, skin='fair', hair_col='red', iris='green', hair='bob', w=R(neck=1.05, chest=1.05, waist=1.14, hip=1.08), d=R(chest=1.04, waist=1.14, hip=1.06), bust=0.02,
                arm=1.1, fore=1.06, thigh=1.08, calf=1.06, head_w=1.03, jaw=1.06, nose=0.9, nose_w=1.08, lips=1.05),
    'f10': dict(name='slim', height=1.67, skin='dark', hair_col='black', iris='dark', hair='bun', w=R(chest=0.97, waist=0.95, hip=0.98), d=R(chest=0.96, waist=0.94), bust=0.013,
                arm=0.96, thigh=0.97, jaw=0.98, nose=0.9, nose_w=1.25, lips=1.25, cheek=1.4, eye_open=1.05),
}

def params(vid=''):
    p = copy.deepcopy(DEF)
    if vid:
        for src in ((F if vid[0] == 'f' else {}), VARIANTS[vid]):
            for k, v in src.items():
                if k in ('w', 'd'):
                    for r, m in v.items(): p[k][r] *= m
                elif k in MULT: p[k] *= v
                else: p[k] = v
        p['sex'] = vid[0]
    p['scale'] = round(p['height'] / DEF['height'], 4)
    p['skin'], p['hair_col'], p['iris'] = SKIN[p['skin']], HAIR[p['hair_col']], EYES[p['iris']]
    return p
