# Debuggausopas - app.js syntaksivirhe

## Nopea diagnoosi

```bash
# Tarkista syntaksi
node -c app.js

# Laske sulkeet
python3 -c "content=open('app.js').read(); print(f'( : {content.count('(')}'); print(f') : {content.count(')')}')"
```

## Menetelmä 1: Binäärihaku

Puolita tiedosto kunnes löydät ongelman:

```bash
# Testaa ensimmäinen puoli
head -5000 app.js > test.js
echo "); }" >> test.js  # Lisää sulkevat sulut
node -c test.js

# Jos virhe löytyy, puolita uudelleen
head -2500 app.js > test.js
echo "); }" >> test.js
node -c test.js

# Jatka kunnes löydät tarkan rivin
```

## Menetelmä 2: Kommentoi modaaleja

Kommentoi pois modaaleja yksi kerrallaan `app.js`:ssä:

```javascript
// 1. Kommentoi CharacterSheet (rivit 9375-9615)
/*
showCharacterSheet && editingCharacter && e('div', {
  ...
})
*/,

// Testaa: node -c app.js
// Jos virhe häviää, ongelma oli CharacterSheet:issä
```

## Menetelmä 3: Grep-haku ongelmallisille rakenteille

```bash
# Etsi virheellisiä spread-operaattoreita
grep -n "^\s*\.\.\.(" app.js

# Etsi puuttuvia pilkkuja ennen && operaattoria
grep -n ")\s*$" app.js | grep -A1 "&&"

# Etsi epätasapainoiset sulkeet yksittäisillä riveillä
awk '{o=gsub(/\(/,""); c=gsub(/\)/,""); if(o!=c) print NR": "o-c}' app.js
```

## Menetelmä 4: Visuaalinen tarkistus

1. Avaa app.js editorissa joka näyttää sulkeiden parit
2. Mene riville 10110
3. Klikkaa `)` merkkiä ja katso missä sen pari on
4. Seuraa rakennetta ylöspäin

## Yleisimmät virheet React.createElement:ssä

### 1. Puuttuva pilkku elementtien välissä

```javascript
❌ Väärin:
e('div', {}, 'text')
e('div', {}, 'text2')

✅ Oikein:
e('div', {}, 'text'),
e('div', {}, 'text2')
```

### 2. Virheellinen spread-operaattori

```javascript
❌ Väärin:
e('div', {},
  ...(items.map(i => e('span', {}, i)))
)

✅ Oikein:
e('div', {},
  items.map(i => e('span', {}, i))
)
```

### 3. Puuttuva sulku ternary-operaattorissa

```javascript
❌ Väärin:
condition && e('div', {},
  something ? e('a') : e('b')
  // Puuttuu sulkeva sulku e('div',...) kutsulle

✅ Oikein:
condition && e('div', {},
  something ? e('a') : e('b')
)
```

### 4. Liikaa/Liian vähän sulkevia sulkeita modaaleissa

```javascript
// CharacterSheet rakenne:
showCharacterSheet && editingCharacter && e('div', {  // Ulompi div (overlay)
  className: 'fixed...'
},
  e('div', {  // Sisempi div (modal content)
    className: 'w-full...'
  },
    // Header
    e('div', {}, ...),
    
    // Content  
    e('div', {}, ...),
    
    // Footer
    e('div', {}, ...)
  )  // Sulkee sisemmän divin
)  // Sulkee ulomman divin
// <- Pilkku tähän jos on seuraava elementti!
```

## Nopea korjaus-checklist

Käy läpi järjestyksessä:

- [ ] Tarkista rivi 10110 ja edeltävät 10 riviä
- [ ] Tarkista onko `TransparentAIIndicator` suljettu oikein
- [ ] Tarkista onko pilkku `TransparentAIIndicator`:n jälkeen (pitäisi olla)
- [ ] Tarkista onko `ThreadSheet` modaali suljettu oikein (3 sulkevaa sulkua)
- [ ] Tarkista onko `ChapterSheet` modaali suljettu oikein (3 sulkevaa sulkua)
- [ ] Tarkista onko `LocationSheet` modaali suljettu oikein (3 sulkevaa sulkua)
- [ ] Tarkista onko `CharacterSheet` modaali suljettu oikein (3 sulkevaa sulkua)

## Automatisoitu tarkistus

Luo tämä skripti `check_brackets.py`:

```python
#!/usr/bin/env python3
def check_brackets(filename):
    with open(filename) as f:
        lines = f.readlines()
    
    stack = []
    for i, line in enumerate(lines, 1):
        for char in line:
            if char == '(':
                stack.append(('(', i))
            elif char == ')':
                if not stack:
                    print(f"Ylimääräinen ) rivillä {i}")
                    return
                stack.pop()
    
    if stack:
        print(f"Puuttuvia sulkevia sulkeita. Viimeinen avoin ( rivillä {stack[-1][1]}")
        print(f"Yhteensä {len(stack)} avointa sulkua")
    else:
        print("Sulkeet täsmäävät!")

check_brackets('app.js')
```

Aja: `python3 check_brackets.py`

## Viimeinen keino: Uudelleenkirjoitus

Jos mikään muu ei toimi:

1. Luo uusi `app_fixed.js`
2. Kopioi sisältö osissa (500 riviä kerrallaan)
3. Testaa jokaisen kopioinnin jälkeen
4. Kun virhe ilmestyy, tiedät missä lohkossa ongelma on
5. Korjaa kyseinen lohko huolellisesti

## Apuvälineet

- **VS Code**: Asenna "Bracket Pair Colorizer" extensio
- **Prettier**: Formatoi koodi automaattisesti
- **ESLint**: Huomaa syntaksivirheet heti

## Tuki

Jos et löydä virhettä:
1. Tallenna `app.js` nimellä `app_broken.js`
2. Aja: `git diff app_broken.js > changes.patch`
3. Jaa `changes.patch` tiedosto
4. Dokumentoi tarkat askeleet jotka johtivat virheeseen


