# MCP Tools Testplan für Claude Desktop

**Anleitung:** Kopiere diesen Prompt in eine **Claude Desktop Session** (NICHT Claude Code!), nachdem Foundry VTT läuft und der MCP Server verbunden ist.

---

## 🎯 Ziel

Teste alle 32 MCP Tools systematisch und dokumentiere welche funktionieren und welche Fehler auftreten.

## ✅ Voraussetzungen Checklist

Bitte bestätige zuerst:

- [ ] Foundry VTT v13 läuft
- [ ] Eine Welt ist geladen (welches System: D&D5e / PF2e / DSA5?)
- [ ] Foundry MCP Bridge Modul ist aktiviert
- [ ] Claude Desktop MCP Server ist verbunden
- [ ] Du siehst MCP Tools verfügbar

## 📋 Systematischer Test aller Tools

### Phase 1: Basis-Konnektivität

**Test 1.1 - Tool List**

```
Liste alle verfügbaren MCP Tools auf und zeige mir die Anzahl.
```

**Erwartung:** 32 Tools

**Test 1.2 - World Info**

```
Verwende get-world-info um mir die Details meiner Foundry Welt zu zeigen.
```

**Erwartung:** World Name, System, Version, User Info

---

### Phase 2: Character Tools (3 Tools)

**Test 2.1 - List Characters**

```
Verwende list-characters um alle verfügbaren Characters in meiner Welt aufzulisten.
```

**Erwartung:** Liste von Characters mit Namen und IDs

**Test 2.2 - Get Character**

```
Verwende get-character für [NAME DES ERSTEN CHARACTERS] und zeige mir seine Stats.
```

**Erwartung:** Detaillierte Character-Daten (HP, AC, Abilities, Skills, Items)

**Test 2.3 - Get Character Entity** ⭐ NEW

```
Verwende get-character-entity um mir Details über ein spezifisches Item/Spell von [CHARACTER NAME] zu zeigen.
Wähle ein Item aus der Item-Liste des Characters.
```

**Erwartung:** Vollständige Item/Spell-Daten mit Description

---

### Phase 3: Compendium Tools (4 Tools)

**Test 3.1 - List Compendium Packs**

```
Verwende list-compendium-packs um alle verfügbaren Compendiums aufzulisten.
```

**Erwartung:** Liste von Pack-IDs und Labels

**Test 3.2 - Search Compendium**

```
Verwende search-compendium um nach "Dragon" zu suchen.
```

**Erwartung:** Liste von Treffern (Items, Creatures, Spells)

**Test 3.3 - List Creatures by Criteria**

```
Verwende list-creatures-by-criteria um alle CR 5 Kreaturen zu finden.
```

**Erwartung:** Gefilterte Liste von Kreaturen

**Test 3.4 - Get Compendium Item**

```
Verwende get-compendium-item um Details über eine spezifische Kreatur aus Test 3.3 zu holen.
```

**Erwartung:** Volle Creature-Daten mit Stats und Description

---

### Phase 4: Scene & World Tools (2 Tools)

**Test 4.1 - Get Current Scene**

```
Verwende get-current-scene um Informationen über die aktuelle Scene zu zeigen.
```

**Erwartung:** Scene Name, Dimensions, Tokens, Walls, Lights

**Test 4.2 - List Scenes**

```
Verwende list-scenes um alle verfügbaren Scenes aufzulisten.
```

**Erwartung:** Liste von Scenes mit IDs und Namen

---

### Phase 5: Token Manipulation Tools ⭐ NEW (6 Tools)

**WICHTIG:** Stelle sicher, dass mindestens 1-2 Tokens auf der aktuellen Scene platziert sind!

**Test 5.1 - Get Token Details**

```
Verwende get-token-details um mir alle Details über den ersten Token auf der aktuellen Scene zu zeigen.
```

**Erwartung:** Position (x, y), Size, Rotation, Visibility, Disposition, Actor Data, Conditions

**Test 5.2 - Get Available Conditions**

```
Verwende get-available-conditions um alle verfügbaren Status-Effekte für mein System zu zeigen.
```

**Erwartung:** Liste von Conditions (Prone, Blinded, Poisoned, etc.) mit IDs

**Test 5.3 - Toggle Token Condition**

```
Verwende toggle-token-condition um die "Prone" Condition auf einen Token anzuwenden.
```

**Erwartung:** Token hat jetzt die Condition angezeigt

**Test 5.4 - Move Token**

```
Verwende move-token um einen Token 100 Pixel nach rechts zu bewegen (x+100).
```

**Erwartung:** Token bewegt sich mit Animation

**Test 5.5 - Update Token**

```
Verwende update-token um die Größe eines Tokens zu ändern (width: 2, height: 2).
```

**Erwartung:** Token ist jetzt 2x2 Grid Squares groß

**Test 5.6 - Delete Tokens**

```
VORSICHT: Erstelle zuerst einen Test-Token!
Verwende delete-tokens um einen spezifischen Token zu löschen.
```

**Erwartung:** Token verschwindet von der Scene

---

### Phase 6: Actor Creation Tools (2 Tools)

**Test 6.1 - Get Compendium Entry Full**

```
Verwende get-compendium-entry-full für eine Kreatur aus dem Compendium.
```

**Erwartung:** Vollständige Entry-Daten vor dem Import

**Test 6.2 - Create Actor from Compendium**

```
Verwende create-actor-from-compendium um einen Goblin (oder ähnliche Kreatur) zu importieren.
Benenne ihn "Test Goblin".
```

**Erwartung:** Neuer Actor erscheint in der Actors Directory

---

### Phase 7: Journal/Quest Tools (5 Tools)

**Test 7.1 - Create Quest Journal**

```
Verwende create-quest-journal um eine Quest "Test Quest: Die verschwundenen Dorfbewohner" zu erstellen.
Füge eine kurze Beschreibung hinzu.
```

**Erwartung:** Neues Journal in der Journal Directory

**Test 7.2 - List Journals**

```
Verwende list-journals um alle Journals aufzulisten.
```

**Erwartung:** Liste inkl. der gerade erstellten Quest

**Test 7.3 - Search Journals**

```
Verwende search-journals um nach "Test Quest" zu suchen.
```

**Erwartung:** Findet die erstellte Quest

**Test 7.4 - Update Quest Journal**

```
Verwende update-quest-journal um der Test Quest einen zusätzlichen Absatz hinzuzufügen.
```

**Erwartung:** Journal wird aktualisiert

**Test 7.5 - Link Quest to NPC**

```
Verwende link-quest-to-npc um die Test Quest mit einem Actor zu verknüpfen.
```

**Erwartung:** Quest ist mit Actor verlinkt

---

### Phase 8: Dice Roll Tools (1 Tool)

**Test 8.1 - Request Player Rolls**

```
Verwende request-player-rolls um einen Stealth Check (1d20+5) für einen Spieler anzufordern.
```

**Erwartung:** Roll-Request erscheint in Foundry Chat

---

### Phase 9: Campaign Management (1 Tool)

**Test 9.1 - Create Campaign Dashboard**

```
Verwende create-campaign-dashboard um ein Campaign Dashboard "Kampagnen-Übersicht" zu erstellen.
```

**Erwartung:** Dashboard-Journal wird erstellt

---

### Phase 10: Ownership Tools (3 Tools)

**Test 10.1 - List Actor Ownership**

```
Verwende list-actor-ownership für einen Actor um die aktuelle Ownership zu sehen.
```

**Erwartung:** Liste von User IDs und Ownership Levels

**Test 10.2 - Assign Actor Ownership**

```
Verwende assign-actor-ownership um einem Spieler Ownership Level 3 (OWNER) für einen Actor zu geben.
```

**Erwartung:** Ownership wird gesetzt

**Test 10.3 - Remove Actor Ownership**

```
Verwende remove-actor-ownership um die Ownership wieder zu entfernen.
```

**Erwartung:** Ownership wird entfernt

---

### Phase 11: Map Generation Tools (5 Tools)

**OPTIONAL - Nur testen wenn ComfyUI installiert ist!**

**Test 11.1 - Check ComfyUI Status**

```
Verwende check-comfyui-status um zu prüfen ob der Map Generation Service läuft.
```

**Erwartung:** Status "running" oder "stopped"

**Test 11.2 - Generate Map** (Nur wenn ComfyUI läuft)

```
Verwende generate-map um eine kleine Karte "Riverside Cottage" zu generieren.
Verwende scene_name: "Test Scene", size: "small", quality: "low".
```

**Erwartung:** Job ID wird zurückgegeben

**Test 11.3 - Check Map Status**

```
Verwende check-map-status mit der Job ID aus Test 11.2.
```

**Erwartung:** Status "pending", "running", oder "complete"

**Test 11.4 - Cancel Map Job**

```
Falls der Job noch läuft, verwende cancel-map-job um ihn abzubrechen.
```

**Erwartung:** Job wird abgebrochen

**Test 11.5 - Switch Scene**

```
Verwende switch-scene um zu einer anderen Scene zu wechseln.
```

**Erwartung:** Active Scene ändert sich

---

## 📊 Test-Ergebnis Template

Bitte fülle nach jedem Test aus:

```
### PHASE X: [Name]

✅ Test X.1: [Tool Name] - ERFOLGREICH
   - Input: [was getestet wurde]
   - Output: [Ergebnis]

❌ Test X.2: [Tool Name] - FEHLER
   - Input: [was getestet wurde]
   - Error: [Fehlermeldung]
   - Details: [zusätzliche Infos]

⚠️ Test X.3: [Tool Name] - TEILWEISE
   - Input: [was getestet wurde]
   - Output: [Ergebnis]
   - Problem: [was nicht funktioniert hat]
```

---

## 🎯 Zusammenfassung

Am Ende des Tests:

1. **Tool Success Rate:** X/32 Tools funktionieren (X%)
2. **Kritische Fehler:** Liste der nicht funktionierenden Tools
3. **Warnings:** Liste von Tools mit Problemen
4. **System getestet:** D&D5e / PF2e / DSA5
5. **Foundry Version:** [Version]
6. **MCP Server Version:** [Version aus package.json]

---

## 🚀 Quick Start

**Schnellster Weg:**

```
Ich möchte alle 32 MCP Tools systematisch testen.
Gehe Phase für Phase durch und teste jedes Tool.
Dokumentiere dabei was funktioniert und was nicht.

Starte mit Phase 1: Basis-Konnektivität.
```

Dann einfach diesem Testplan folgen!
