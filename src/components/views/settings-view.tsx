'use client';

import { useState } from 'react';
import {
  Container,
  Terminal,
  Key,
  Palette,
  Bell,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrchestraStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-sm">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export default function SettingsView() {
  const systemStatus = useOrchestraStore((s) => s.systemStatus);
  const checkSystemStatus = useOrchestraStore((s) => s.checkSystemStatus);

  const [activeTab, setActiveTab] = useState('execution');
  const [dockerImage, setDockerImage] = useState('orchestra-sandbox:latest');
  const [defaultBackend, setDefaultBackend] = useState('local');

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure Orchestra Desktop preferences
        </p>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-48 border-r p-4">
          <nav className="space-y-1">
            {[
              { id: 'execution', label: 'Execution', icon: Terminal },
              { id: 'docker', label: 'Docker', icon: Container },
              { id: 'api-keys', label: 'API Keys', icon: Key },
              { id: 'appearance', label: 'Appearance', icon: Palette },
              { id: 'notifications', label: 'Notifications', icon: Bell },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors',
                    activeTab === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-6 max-w-2xl">
            {activeTab === 'execution' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Execution Settings</h2>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">CLI Detection</CardTitle>
                      <CardDescription>
                        Status of detected command-line tools
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between py-2">
                        <span>Claude CLI</span>
                        <div className="flex items-center gap-2">
                          {systemStatus.claudeCliDetected ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="text-sm text-green-500">Detected</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">Not found</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between py-2">
                        <span>Codex CLI</span>
                        <div className="flex items-center gap-2">
                          {systemStatus.codexCliDetected ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="text-sm text-green-500">Detected</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">Not found</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between py-2">
                        <span>Gemini CLI</span>
                        <div className="flex items-center gap-2">
                          {systemStatus.geminiCliDetected ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="text-sm text-green-500">Detected</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">Not found</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Separator />
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => checkSystemStatus()}
                          className="gap-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Refresh Detection
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-base">Default Backend</CardTitle>
                      <CardDescription>
                        Choose the default execution environment
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select value={defaultBackend} onValueChange={setDefaultBackend}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local (Direct execution)</SelectItem>
                          <SelectItem value="docker">Docker (Sandboxed)</SelectItem>
                          <SelectItem value="docker-interactive">Docker Interactive</SelectItem>
                          <SelectItem value="remote">Remote SSH</SelectItem>
                          <SelectItem value="modal">Modal (Serverless)</SelectItem>
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === 'docker' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Docker Configuration</h2>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Docker Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between py-2">
                        <span>Docker Daemon</span>
                        <div className="flex items-center gap-2">
                          {systemStatus.dockerAvailable ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="text-sm text-green-500">Running</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-red-500" />
                              <span className="text-sm text-red-500">Not running</span>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-base">Default Image</CardTitle>
                      <CardDescription>
                        Docker image used for sandboxed execution
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Input
                        value={dockerImage}
                        onChange={(e) => setDockerImage(e.target.value)}
                        placeholder="orchestra-sandbox:latest"
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === 'api-keys' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-4">API Keys</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    API keys are managed through environment variables or the respective CLI tools.
                  </p>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Anthropic API</p>
                            <p className="text-xs text-muted-foreground">ANTHROPIC_API_KEY</p>
                          </div>
                          <Badge variant="outline">Via claude CLI</Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">OpenAI API</p>
                            <p className="text-xs text-muted-foreground">OPENAI_API_KEY</p>
                          </div>
                          <Badge variant="outline">Via codex CLI</Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Google AI API</p>
                            <p className="text-xs text-muted-foreground">GOOGLE_API_KEY</p>
                          </div>
                          <Badge variant="outline">Via gemini CLI</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Appearance</h2>

                  <Card>
                    <CardContent className="pt-6">
                      <SettingRow
                        label="Theme"
                        description="Choose your preferred color scheme"
                      >
                        <Select defaultValue="system">
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                            <SelectItem value="system">System</SelectItem>
                          </SelectContent>
                        </Select>
                      </SettingRow>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Notifications</h2>

                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">
                        Notification settings coming soon.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
