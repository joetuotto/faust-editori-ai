/**
 * Settings Modal
 * Configure FAUST AI settings with API and general tabs
 */

import React from 'react';
import Modal from './Modal';
import type { Project } from '../../types';

interface ApiTestResult {
  success: boolean | null;
  message: string;
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  settingsTab: 'api' | 'general';
  apiTestResult: ApiTestResult | null;
  onSetSettingsTab: (tab: 'api' | 'general') => void;
  onSetActiveApiProvider: (provider: string) => void;
  onUpdateApiKey: (provider: string, key: string) => void;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  onSetUnsavedChanges: (value: boolean) => void;
  onTestApiConnection: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  project,
  settingsTab,
  apiTestResult,
  onSetSettingsTab,
  onSetActiveApiProvider,
  onUpdateApiKey,
  onUpdateProject,
  onSetUnsavedChanges,
  onTestApiConnection
}) => {
  const e = React.createElement;

  if (!isOpen) return null;

  return e(Modal, {
    isOpen,
    onClose,
    maxWidth: '700px'
  },
    // Header
    e('h2', {
      style: {
        fontFamily: 'EB Garamond',
        fontSize: '24px',
        color: 'var(--text)',
        marginBottom: '8px'
      }
    }, '⚙️ Asetukset'),

    e('p', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '12px',
        color: 'var(--text-2)',
        marginBottom: '24px'
      }
    }, 'Konfiguroi FAUST AI -asetukset'),

    // Tabs
    e('div', {
      style: {
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '12px'
      }
    },
      ['api', 'general'].map(tab =>
        e('button', {
          key: tab,
          onClick: () => onSetSettingsTab(tab as 'api' | 'general'),
          style: {
            padding: '8px 16px',
            background: settingsTab === tab ? 'var(--bronze)' : 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: settingsTab === tab ? '#000' : 'var(--text-2)',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            fontWeight: settingsTab === tab ? 600 : 400
          }
        }, tab === 'api' ? 'API Asetukset' : 'Yleiset')
      )
    ),

    // API Settings Tab
    settingsTab === 'api' ? e('div', null,
      // API Type Selection
      e('div', {
        style: {
          marginBottom: '24px'
        }
      },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-3)',
            marginBottom: '8px',
            textTransform: 'uppercase'
          }
        }, 'API Type'),

        e('div', {
          style: {
            display: 'flex',
            gap: '8px'
          }
        },
          ['cloud', 'local'].map(type =>
            e('button', {
              key: type,
              onClick: () => {
                const newProvider = type === 'cloud' ? 'anthropic' : 'local';
                onSetActiveApiProvider(newProvider);
              },
              style: {
                flex: 1,
                padding: '12px',
                background: project.apiConfig.provider !== 'local' ?
                  (type === 'cloud' ? 'var(--bg-2)' : 'transparent') :
                  (type === 'local' ? 'var(--bg-2)' : 'transparent'),
                border: `2px solid ${
                  project.apiConfig.provider !== 'local' ?
                    (type === 'cloud' ? 'var(--bronze)' : 'var(--border-color)') :
                    (type === 'local' ? 'var(--bronze)' : 'var(--border-color)')
                }`,
                borderRadius: '4px',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px'
              }
            },
              type === 'cloud' ? '☁️ Cloud API' : '🖥️ Local Server'
            )
          )
        )
      ),

      // Cloud API Configuration
      project.apiConfig.provider !== 'local' ? e('div', null,
        // API Key
        e('div', {
          style: {
            marginBottom: '16px'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-3)',
              marginBottom: '8px',
              textTransform: 'uppercase'
            }
          }, 'API Key'),

          e('input', {
            type: 'password',
            value: project.apiConfig[project.apiConfig.provider]?.apiKey || project.apiConfig.anthropic.apiKey,
            onChange: (ev: React.ChangeEvent<HTMLInputElement>) => onUpdateApiKey(
              project.apiConfig.provider === 'local' ? 'anthropic' : project.apiConfig.provider,
              ev.target.value
            ),
            placeholder: 'sk-ant-... tai sk-... tai xai-...',
            style: {
              width: '100%',
              padding: '12px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              outline: 'none'
            }
          }),

          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text-3)',
              marginTop: '8px',
              fontStyle: 'italic'
            }
          }, '🔑 Hanki API-avain: console.anthropic.com, platform.openai.com, x.ai, deepseek.com')
        ),

        // Model Name
        e('div', {
          style: {
            marginBottom: '16px'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-3)',
              marginBottom: '8px',
              textTransform: 'uppercase'
            }
          }, 'Model Name'),

          e('input', {
            type: 'text',
            value: project.ai?.activeModel || 'claude-3-5-sonnet-20241022',
            onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
              onUpdateProject(prev => ({
                ...prev,
                ai: {
                  ...prev.ai,
                  activeModel: ev.target.value
                }
              }));
              onSetUnsavedChanges(true);
            },
            placeholder: 'claude-3-5-sonnet-20241022',
            style: {
              width: '100%',
              padding: '12px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              outline: 'none'
            }
          }),

          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text-3)',
              marginTop: '8px',
              fontStyle: 'italic'
            }
          }, '📝 Syötä täsmällinen mallin nimi (esim. claude-3-5-sonnet-20241022, gpt-4-turbo, grok-2-1212)')
        ),

        // Quick Select buttons
        e('div', {
          style: {
            marginBottom: '24px'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text-3)',
              marginBottom: '8px'
            }
          }, 'PIKA-VALINTA:'),

          e('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px'
            }
          },
            [
              { name: 'Claude 3.5 Sonnet', model: 'claude-3-5-sonnet-20241022' },
              { name: 'GPT-4 Turbo', model: 'gpt-4-turbo-preview' },
              { name: 'Grok 2', model: 'grok-2-1212' },
              { name: 'DeepSeek V3', model: 'deepseek-chat' }
            ].map(preset =>
              e('button', {
                key: preset.model,
                onClick: () => {
                  onUpdateProject(prev => ({
                    ...prev,
                    ai: {
                      ...prev.ai,
                      activeModel: preset.model
                    }
                  }));
                  onSetUnsavedChanges(true);
                },
                style: {
                  padding: '8px',
                  background: project.ai?.activeModel === preset.model ? 'var(--bronze)' : 'var(--bg-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: project.ai?.activeModel === preset.model ? '#000' : 'var(--text-2)',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  fontWeight: project.ai?.activeModel === preset.model ? 600 : 400
                }
              }, preset.name)
            )
          )
        )
      ) : null,

      // Local Endpoint Configuration
      project.apiConfig.provider === 'local' ? e('div', {
        style: {
          marginBottom: '24px'
        }
      },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-3)',
            marginBottom: '8px',
            textTransform: 'uppercase'
          }
        }, 'Local Endpoint URL'),

        e('input', {
          type: 'text',
          value: project.apiConfig.local.endpoint,
          onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
            onUpdateProject(prev => ({
              ...prev,
              apiConfig: {
                ...prev.apiConfig,
                local: {
                  ...prev.apiConfig.local,
                  endpoint: ev.target.value
                }
              }
            }));
            onSetUnsavedChanges(true);
          },
          placeholder: 'http://localhost:1234/v1',
          style: {
            width: '100%',
            padding: '12px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text)',
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            outline: 'none'
          }
        }),

        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-3)',
            marginTop: '8px',
            fontStyle: 'italic'
          }
        }, '🖥️ Esim. Ollama, LM Studio tai muu OpenAI-yhteensopiva palvelin')
      ) : null,

      // Divider
      e('div', {
        style: {
          borderTop: '1px solid var(--border-color)',
          marginTop: '32px',
          paddingTop: '24px'
        }
      }),

      // Test connection button
      e('button', {
        onClick: onTestApiConnection,
        style: {
          width: '100%',
          padding: '12px',
          background: 'var(--bronze)',
          border: 'none',
          borderRadius: '4px',
          color: '#000',
          cursor: 'pointer',
          fontFamily: 'IBM Plex Mono',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '16px'
        }
      }, '🔍 Testaa yhteyttä'),

      // Test result
      apiTestResult ? e('div', {
        style: {
          padding: '12px',
          background: apiTestResult.success === null ? 'var(--bg-2)' :
                     apiTestResult.success ? 'rgba(76,175,80,0.1)' : 'rgba(239,83,80,0.1)',
          border: `1px solid ${apiTestResult.success === null ? 'var(--border-color)' :
                               apiTestResult.success ? '#4CAF50' : '#EF5350'}`,
          borderRadius: '4px',
          marginBottom: '16px'
        }
      },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: apiTestResult.success === null ? 'var(--text-2)' :
                   apiTestResult.success ? '#4CAF50' : '#EF5350'
          }
        }, apiTestResult.message)
      ) : null,

      // API Usage stats
      e('div', {
        style: {
          padding: '16px',
          background: 'var(--bg-2)',
          borderRadius: '4px',
          border: '1px solid var(--border-color)'
        }
      },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-3)',
            marginBottom: '12px',
            textTransform: 'uppercase'
          }
        }, 'API Käyttö'),

        e('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-2)'
            }
          }, `Pyyntöjä: ${project.ai.costTracking.requestCount}`),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-2)'
            }
          }, `Tokeneita: ${project.ai.costTracking.tokensUsed}`),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-2)'
            }
          }, `Kustannukset: ~$${project.ai.costTracking.totalSpent.toFixed(2)}`),
          project.apiConfig.lastTested ? e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text-3)',
              fontStyle: 'italic',
              marginTop: '4px'
            }
          }, `Viimeksi testattu: ${new Date(project.apiConfig.lastTested).toLocaleString('fi-FI')}`) : null
        )
      )
    ) : null,

    // General Settings Tab
    settingsTab === 'general' ? e('div', null,
      e('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '13px',
          color: 'var(--text-2)',
          textAlign: 'center',
          padding: '48px'
        }
      }, 'Yleisiä asetuksia tulossa...')
    ) : null
  );
};

export default Settings;
