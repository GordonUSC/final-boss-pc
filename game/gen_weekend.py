"""Generates the Phase 2 data block inside game.js (Sin City Weekend opponents, bracket, and the Fun Fabulous Facts deck).
Sources (outside this repo, the reviewed asset packs):
  ~/work/final-boss-2027/opponents-20261026/teams.json   16 fictional opponents, bracket, abilities with tells and counters
  ~/work/final-boss-2027/fabulous-facts-20261026/ship/cards.json   18 fact cards (deck A public, deck B Gordon's story)
Run after either source changes:  cd game && python3 gen_weekend.py [path/to/game.js]
Every team plays the same real rules; the data only carries play style, strategy weights, ratings and abilities (each with a tell).
"""
import json, os, re, sys

HOME = os.path.expanduser('~')
TEAMS = os.path.join(HOME, 'work/final-boss-2027/opponents-20261026/teams.json')
CARDS = os.path.join(HOME, 'work/final-boss-2027/fabulous-facts-20261026/ship/cards.json')
here = os.path.dirname(os.path.abspath(__file__))
GAME = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'game.js')

# ability name -> engine hook, its knobs, and its tell sound (ElevenLabs, assets/audio/<sfx>.mp3)
HOOK = {
    'RIPTIDE': ('shot', {'base': 'moon', 'speed': 0.8, 'curve': 0.6}, 'tell_riptide'),
    'SCHOOL OF FISH': ('school', {'n': 2, 'lag': 9}, 'tell_school'),
    'ROLLING PIN': ('shot', {'base': 'normal', 'aim': 0.32, 'speed': 0.85, 'flat': 1}, 'tell_rollpin'),
    'PROOFING': ('proof', {'sec': 4, 'max': 1.3}, 'tell_proof'),
    'LASSO REACH': ('reach', {'mul': 1.3}, 'tell_lasso'),
    'MOON HOP': ('moonhop', {'p': 0.5, 'land': 21}, 'tell_moonhop'),
    'BOUQUET TOSS': ('shot', {'base': 'moon', 'back': 1}, 'tell_bouquet'),
    'PLUS ONE PASS': ('passthrow', {'wind': 0.9}, 'tell_plusone'),
    'TO THE RESCUE': ('rescue', {'r': 1.6}, 'tell_side_got'),
    'HERO ANSWER': ('answer', {'power': 1.15, 'wind': 0.85}, 'tell_hero'),
    'JAZZ HANDS FAKE': ('fake', {'bait': 0.3}, 'tell_jazzhands'),
    'FIVE, SIX, SEVEN, EIGHT': ('multi', {'n': 2, 'count': 54}, 'tell_jazz_count'),
    'THREE-PART HARMONY': ('multi', {'n': 3, 'stagger': 15, 'count': 30}, 'tell_harmony'),
    'KEY CHANGE': ('keychange', {'comp': 0.15, 'power': 1.1}, 'tell_keychange'),
    'FEATHER-LIGHT DODGE': ('evade', {'p': 0.5, 'cd': 180, 'state': 'spin'}, 'tell_twirl'),
    'BOA FAKE': ('boa', {'p': 0.3}, 'tell_boa'),
    'PYRAMID CATCH': ('highcatch', {'p': 0.6}, 'tell_pyr_ready'),
    'BASKET TOSS THROW': ('shot', {'base': 'normal', 'release': 2.4, 'hard': 1}, 'tell_pyr_hit'),
    'JAMMER BURST': ('burst', {'mul': 1.3, 'frames': 60}, 'tell_jammer'),
    'WHIP ASSIST': ('passthrow', {'wind': 0.8}, 'tell_whip'),
    'TOE PICK STOP': ('evade', {'p': 0.4, 'cd': 150, 'state': 'lean'}, 'tell_toepick'),
    'SPIRAL THROW': ('shot', {'base': 'hook', 'acc': 1.15}, 'tell_spiral'),
    'GLITTER SPIN': ('shot', {'base': 'comet', 'wobble': 0.25, 'acc': 0.85}, 'tell_glitter'),
    'STROBE STEP': ('strobe', {'p': 0.35, 'cd': 240}, 'tell_strobe'),
    'DIP AND PARTNER CATCH': ('rescue', {'r': 1.6, 'partner': 1}, 'tell_house_dip'),
    'TENS ACROSS THE BOARD': ('tens', {}, 'tell_tens'),
    'CAPE SWIRL': ('cape', {'p': 0.6, 'cd': 180}, 'tell_cape'),
    'MIDNIGHT STRIKE': ('midnight', {}, 'tell_midnight'),
    'NEEDLE SHOT': ('shot', {'base': 'comet', 'aim': 0.35, 'acc': 1.2, 'speed': 1.05}, 'tell_needle'),
    'DESERT BLOOM': ('bloom', {'uses': 2, 'acc': 1.2}, 'tell_bloom'),
    'ROYAL BLOCK-AND-HOLD': ('royal', {}, 'tell_gem'),
    'DECREE DOUBLE': ('multi', {'n': 2, 'count': 24}, 'tell_fan'),
}
SHORT_TELL = {'FIVE, SIX, SEVEN, EIGHT': '5, 6, 7, 8!', 'THREE-PART HARMONY': 'HARMONY!', 'DIP AND PARTNER CATCH': 'DIP!', 'TENS ACROSS THE BOARD': '10, 10, 10!',
              'ROYAL BLOCK-AND-HOLD': 'ROYAL BLOCK!', 'FEATHER-LIGHT DODGE': 'TWIRL!', 'PYRAMID CATCH': 'READY? OK!', 'BASKET TOSS THROW': 'HIT IT!', 'TO THE RESCUE': 'I GOT IT!'}


# Astra Phase 2 content check (2026-10-26, ASTRA-PHASE2-CONTENT-CHECK.md): corrected card text, applied over the reviewed cards.json
CARD_FIX = {
    'A01': {'text': 'The 2027 festival celebrates its twentieth anniversary with a weekend of sport in Las Vegas.', 'voSecs': 4.96},
    'A03': {'text': 'The festival advertises more than 10,000 athletes and 24 sports for one fabulous weekend.', 'voSecs': 5.46},
    'A04': {'text': 'Organizers describe over a hundred teams, with past appearances from Canada, England, Australia and Denmark.', 'voSecs': 5.95},
    'A08': {'text': 'A valid catch eliminates the thrower and lets an eligible queued teammate return.', 'voSecs': 4.28},
    'A09': {'text': 'The rulebook calls for soft rubber balls. Bring your best catching hands.', 'voSecs': 4.54},
    'A12': {'text': 'The 2026 welcome-party listing advertised disco karaoke, bringing a musical warmup to the festival weekend.', 'voSecs': 6.27},
}
# 2026-10-26 the six reads were re-recorded to match the corrected text (ElevenLabs David, eleven_multilingual_v2, about -17.2 LUFS like the rest)
VO_STALE = set()
# 2026-10-27 Gordon: thank the Sin City staff. General wording, no numbers. VO: ElevenLabs David, eleven_multilingual_v2, matched to the deck level
EXTRA_CARDS = [{'id': 'S01', 'deck': 'A', 'layout': 'dyk', 'head': 'Thank you, Staff!', 'text': 'Behind every Sin City weekend is a staff who plan the brackets, run the courts and welcome everyone in. Gratitude is the attitude.', 'spot': 'staff-thanks', 'vo': 'S01', 'status': 'GORDON-OK', 'voSecs': 7.99}]


def emblem_only(svg):
    # the team's emblem without the shield, for a one-color mask (pops, health bar, countdown disc) so every cue carries the team's SHAPE
    inner = re.sub(r'^<svg[^>]*>', '', svg).replace('</svg>', '')
    inner = re.sub(r'<path d="M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z"[^>]*/>', '', inner, count=1)
    return inner


def team(t):
    ab = []
    for a in t['abilities']:
        hook, knobs, sfx = HOOK[a['name']]
        ab.append({'name': a['name'], 'hook': hook, 'k': knobs, 'sfx': sfx, 'say': SHORT_TELL.get(a['name'], a['name'] + '!'), 'tell': a['tell'], 'counter': a['counter'], 'effect': a['effect']})
    w = t['strategy']['weights']
    return {
        'id': t['id'], 'name': t['name'], 'short': re.sub(r'^THE ', '', t['name']), 'lvl': t['aiLevel'], 'rank': t['difficultyRank'], 'pool': t['pool'],
        'who': t['identity'], 'colors': t['colors'], 'sig': t['signature'], 'dark': t['dark'], 'shape': t['emblem']['shape'],
        'crest': t['crestSvg'], 'emblem': emblem_only(t['crestSvg']),
        'boss': {k: t['boss'][k] for k in ('key', 'stage', 'num', 'skin', 'build', 'shots', 'look')},
        'players': [{k: p[k] for k in ('key', 'num', 'skin', 'build', 'shots', 'look')} for p in t['players']],
        'w': {'patience': w['patience'], 'push': w['aggression'], 'fake': w['pumpFake'], 'flank': w['flank'], 'calls': w['passCalls'], 'lastBall': w['lastBallHold'], 'multi': w['multiBall'], 'catchFirst': w.get('catchFirst', 0.5), 'aimLow': w.get('aimLow', 0.5)},
        'sync': t['style']['sync'], 'ab': ab, 'rt': t['ratings'], 'brt': t['bossRt'], 'weak': t['weakness'], 'scout': t['scouting'],
        'signs': t['signs'], 'intro': t['intro'], 'taunt': t['taunt'], 'style': t['playStyle']['summary'],
    }


def main():
    T = json.load(open(TEAMS))
    teams = [team(t) for t in T['teams']]
    br = T['bracket']
    bracket = {'pools': {k: v['teams'] for k, v in br['saturday']['pools'].items()}, 'seeded': br['saturday']['seeded']}
    cards = json.load(open(CARDS)) + [dict(c) for c in EXTRA_CARDS]
    for c in cards:
        c.update(CARD_FIX.get(c['id'], {}))
        if c['id'] in VO_STALE: c['voStale'] = True
    for c in cards:
        for k in ('text', 'quote', 'head', 'by', 'num'):
            if k in c and re.search('[–—]', str(c[k])):
                raise SystemExit('dash in card ' + c['id'])
    data = ('// @@P2-DATA-BEGIN generated by gen_weekend.py from teams.json ' + T['version'] + ' and cards.json; do not edit by hand\n'
            'const WK_TEAMS = ' + json.dumps(teams, separators=(',', ':'), ensure_ascii=False) + ';\n'
            'const WK_BRACKET = ' + json.dumps(bracket, separators=(',', ':')) + ';\n'
            'const FACT_CARDS = ' + json.dumps(cards, separators=(',', ':'), ensure_ascii=False) + ';\n'
            '// @@P2-DATA-END\n')
    src = open(GAME).read()
    if '// @@P2-DATA-BEGIN' in src:
        src = re.sub(r'// @@P2-DATA-BEGIN.*?// @@P2-DATA-END\n', lambda m: data, src, flags=re.S)
    else:
        anchor = '// ---------------------------------------------------------------- color utils\n'
        assert src.count(anchor) == 1
        src = src.replace(anchor, data + anchor)
    open(GAME, 'w').write(src)
    print('wrote', len(teams), 'teams,', len(cards), 'cards,', len(data), 'bytes into', GAME)


if __name__ == '__main__':
    main()
