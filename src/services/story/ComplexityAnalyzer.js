/**
 * FAUST - Story Complexity Analyzer
 * Analyzes project complexity based on word count, characters,
 * plot threads, timelines, and narrative structure.
 */
(function(window) {
  'use strict';

  var ComplexityAnalyzer = {
    analyze: function(project) {
      var wordCount = project.structure.reduce(function(sum, ch) {
        return sum + (ch.wordCount || 0);
      }, 0);

      var allCharacters = new Set();
      project.structure.forEach(function(ch) {
        if (ch.notesAI && ch.notesAI.characterMentions) {
          ch.notesAI.characterMentions.forEach(function(name) {
            allCharacters.add(name);
          });
        }
      });
      var characterCount = allCharacters.size || (project.characters ? project.characters.length : 0) || 0;

      var plotThreadCount = project.plotThreads
        ? Object.keys(project.plotThreads).length
        : this.estimatePlotThreads(project);

      var timelineCount = this.detectTimelineCount(project);
      var hasNonLinear = this.detectNonLinearStructure(project);

      var score =
        (wordCount / 1000) * 0.3 +
        characterCount * 2 +
        plotThreadCount * 3 +
        timelineCount * 5 +
        (hasNonLinear ? 10 : 0);

      var phase = this.recommendPhase(score);

      return {
        wordCount: wordCount,
        characterCount: characterCount,
        plotThreadCount: plotThreadCount,
        timelineCount: timelineCount,
        hasNonLinear: hasNonLinear,
        score: Math.round(score),
        phase: phase,
        recommendation: this.getRecommendation(phase, score)
      };
    },

    estimatePlotThreads: function(project) {
      var themes = new Set();
      project.structure.forEach(function(ch) {
        if (ch.notesAI && ch.notesAI.themes) {
          ch.notesAI.themes.forEach(function(theme) {
            themes.add(theme);
          });
        }
      });
      return Math.max(1, Math.floor(themes.size * 0.5));
    },

    detectTimelineCount: function(project) {
      var timeKeywords = {
        past: /aikaisemmin|aiemmin|silloin|muinoin|nuorena|lapsuudessa/i,
        future: /tulevaisuudessa|myöhemmin|jonain päivänä|tulee|aikoo/i,
        parallel: /samaan aikaan|samalla hetkellä|meanwhile|sillä välin/i
      };

      var timelines = 1;
      var hasPast = false, hasFuture = false, hasParallel = false;

      project.structure.forEach(function(ch) {
        var text = (ch.synopsis || '') + ' ' + ((ch.notesAI && ch.notesAI.timeframe) || '');
        if (timeKeywords.past.test(text)) hasPast = true;
        if (timeKeywords.future.test(text)) hasFuture = true;
        if (timeKeywords.parallel.test(text)) hasParallel = true;
      });

      if (hasPast) timelines++;
      if (hasFuture) timelines++;
      if (hasParallel) timelines++;

      return timelines;
    },

    detectNonLinearStructure: function(project) {
      var nonLinearKeywords = /takaumat|flashback|hyppää ajassa|muisto|palataan|flash forward/i;
      return project.structure.some(function(ch) {
        var text = (ch.synopsis || '') + ' ' + (ch.notes || '');
        return nonLinearKeywords.test(text);
      });
    },

    recommendPhase: function(score) {
      if (score < 30) return 0;
      if (score < 60) return 1;
      if (score < 100) return 2;
      return 3;
    },

    getRecommendation: function(phase, score) {
      var recommendations = {
        0: {
          title: '✅ Yksinkertainen tarina',
          message: 'Nykyinen järjestelmä toimii erinomaisesti.',
          accuracy: '85%',
          action: 'Ei toimenpiteitä tarvita.',
          color: '#4CAF50'
        },
        1: {
          title: '📊 Keskimääräinen kompleksisuus',
          message: 'Tarina kasvaa monimutkaisemmaksi.',
          accuracy: '85-90%',
          action: 'Harkitse Phase 1 optimointeja jos havaitset ongelmia.',
          color: '#FF9800'
        },
        2: {
          title: '🌟 Monimutkainen tarina',
          message: 'Suuri hahmojen määrä tai monimutkaiset juonilangat.',
          accuracy: '90-95%',
          action: 'Suositellaan Graph Memory -järjestelmää (Phase 2).',
          color: '#FF5722'
        },
        3: {
          title: '🎭 Eeppinen sarja',
          message: 'Erittäin laaja ja monimutkainen teos.',
          accuracy: '95-97%',
          action: 'Harkitse Full Hybrid -järjestelmää (Phase 3).',
          color: '#9C27B0'
        }
      };
      return recommendations[phase] || recommendations[0];
    }
  };

  window.ComplexityAnalyzer = ComplexityAnalyzer;
})(window);
