import { Anchor, Box, Button, Card, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_CONTACT_EMAIL, ADMIN_CONTACT_LABEL, HOW_IT_WORKS } from '../../../src/core/membership.ts';
import { INTRO_TEXT } from '../../../src/core/tracked.ts';
import Layout from '../components/Layout.tsx';
import IntroCounters from '../intro/IntroCounters.tsx';
import { animateCounters, MOTION_QUERY, setupIntroMotion } from '../intro/introMotion.ts';

// 슬로건을 단어(줄바꿈 단위)와 글자(등장 단위)로 나눈다. id 는 원문 안 위치라 바뀌지 않는다.
const SLOGAN_WORDS: { id: string; chars: { id: string; ch: string }[] }[] = [];
{
  let offset = 0;
  for (const word of INTRO_TEXT.slogan.split(' ')) {
    const chars = Array.from(word).map((ch) => ({ id: `c${offset++}`, ch }));
    SLOGAN_WORDS.push({ id: `w${offset}`, chars });
    offset++;
  }
}

function motionAllowed(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOTION_QUERY).matches;
}

function Slogan() {
  return (
    <Title
      order={1}
      aria-label={INTRO_TEXT.slogan}
      fz={{ base: 34, sm: 52 }}
      lh={1.2}
      fw={800}
      style={{ letterSpacing: '-0.02em', wordBreak: 'keep-all' }}
    >
      {SLOGAN_WORDS.map((word, w) => (
        <span key={word.id}>
          <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {word.chars.map(({ id, ch }) => (
              <span
                key={id}
                aria-hidden="true"
                data-intro-char=""
                style={{ display: 'inline-block', willChange: 'transform' }}
              >
                {ch}
              </span>
            ))}
          </span>
          {w < SLOGAN_WORDS.length - 1 ? <span aria-hidden="true"> </span> : null}
        </span>
      ))}
    </Title>
  );
}

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const initiallyOn = !motionAllowed();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return setupIntroMotion(root);
  }, []);

  const onCountersReady = useCallback(() => {
    if (rootRef.current) animateCounters(rootRef.current);
  }, []);

  return (
    <Layout>
      <Stack gap={48} ref={rootRef}>
        <Paper
          data-testid="landing-hero"
          withBorder
          radius="md"
          px={{ base: 'lg', sm: 48 }}
          py={{ base: 48, sm: 80 }}
          bg="gray.0"
          style={{ overflow: 'hidden' }}
        >
          <Stack gap="lg" maw={640}>
            <Text data-intro-fade="" c="teal.8" fw={700} size="sm" style={{ letterSpacing: '0.08em' }}>
              공약추적기
            </Text>
            <Slogan />
            <Text data-intro-fade="" size="lg" c="gray.7" style={{ wordBreak: 'keep-all' }}>
              당선인의 선거공약서를 공약 하나씩 나누고, 공개 자료에서 찾은 근거와 상태 변경 이력을 함께 보여 줍니다.
              판단은 근거 링크를 직접 읽고 하시면 됩니다.
            </Text>
            <Text data-intro-fade="" size="sm" c="dimmed">
              아래로 내리면 공약 하나가 공개되기까지의 다섯 단계를 볼 수 있습니다 ↓
            </Text>
          </Stack>
        </Paper>

        {/* pin 대상의 부모가 flex 면 ScrollTrigger 가 pinSpacing 을 끄므로 블록 div 로 감싼다. */}
        <div>
          <Box data-testid="intro-steps" component="section" aria-labelledby="intro-steps-title" py="md">
            <Stack gap="md">
              <Stack gap={6}>
                <Title id="intro-steps-title" order={2} size="h3">
                  어떻게 동작하나
                </Title>
                <Text size="sm" c="dimmed">
                  원문에서 공개까지, 모든 단계는 사람이 확인할 수 있는 자료로 남습니다.
                </Text>
              </Stack>
              <Box h={4} bg="gray.2" style={{ borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
                <Box
                  data-steps-progress=""
                  h="100%"
                  bg="teal.6"
                  style={{ transformOrigin: 'left center', transform: initiallyOn ? undefined : 'scaleX(0)' }}
                />
              </Box>
              <Stack gap="sm" component="ol" m={0} p={0} style={{ listStyle: 'none' }}>
                {HOW_IT_WORKS.map((step, i) => (
                  <Card
                    key={step.key}
                    component="li"
                    data-testid={`how-step-${step.key}`}
                    data-state={initiallyOn || i === 0 ? 'on' : 'off'}
                    withBorder
                    radius="md"
                    padding="md"
                  >
                    <Group gap="md" wrap="nowrap" align="flex-start">
                      <Box pos="relative" w={32} h={32} style={{ flex: 'none' }} aria-hidden="true">
                        <Box
                          pos="absolute"
                          inset={0}
                          bg="gray.1"
                          c="gray.6"
                          fw={700}
                          style={{ borderRadius: '50%', display: 'grid', placeItems: 'center' }}
                        >
                          {i + 1}
                        </Box>
                        <Box
                          data-step-mark=""
                          pos="absolute"
                          inset={0}
                          bg="teal.6"
                          c="white"
                          fw={700}
                          style={{ borderRadius: '50%', display: 'grid', placeItems: 'center' }}
                        >
                          {i + 1}
                        </Box>
                      </Box>
                      <Stack gap={4} style={{ minWidth: 0 }}>
                        <Text fw={700}>{step.title}</Text>
                        <Text size="sm" c="gray.7" style={{ wordBreak: 'keep-all' }}>
                          {step.body}
                        </Text>
                      </Stack>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Stack>
          </Box>
        </div>

        <Stack gap="md">
          <IntroCounters onReady={onCountersReady} />
          <Text data-testid="intro-contact" size="sm" c="dimmed" style={{ wordBreak: 'keep-all' }}>
            추적을 원하는 정치인이나 숫자에 대한 문의는{' '}
            <Anchor href={`mailto:${ADMIN_CONTACT_EMAIL}`} c="teal.8" inherit>
              {ADMIN_CONTACT_LABEL}: {ADMIN_CONTACT_EMAIL}
            </Anchor>
          </Text>
        </Stack>

        <Paper data-testid="intro-cta" withBorder radius="md" p={{ base: 'lg', sm: 'xl' }} bg="teal.0">
          <Stack gap="md">
            <Title order={2} size="h3">
              직접 확인해 보세요
            </Title>
            <Text c="gray.7" style={{ wordBreak: 'keep-all' }}>
              추적 중인 정치인의 공약과 근거를 찾아보거나, 가상 데이터로 검수 과정을 체험할 수 있습니다.
            </Text>
            <Group gap="sm">
              <Button component={Link} to="/search" color="teal" size="md">
                {INTRO_TEXT.ctaSearch}
              </Button>
              <Button component={Link} to="/tour" variant="default" size="md">
                {INTRO_TEXT.ctaTour}
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Layout>
  );
}
