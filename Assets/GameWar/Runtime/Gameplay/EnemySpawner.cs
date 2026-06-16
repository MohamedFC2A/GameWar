using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace GameWar
{
    public class EnemySpawner : MonoBehaviour
    {
        [SerializeField]
        private float spawnRadius = 12f;

        [SerializeField]
        private float arenaPadding = 2f;

        private readonly List<TankRuntimeBinder> activeEnemies = new List<TankRuntimeBinder>();
        private Coroutine spawnRoutine;
        private StageDefinition currentStage;
        private Transform playerTarget;

        public event Action<StageDefinition> StageCompleted;

        public int AliveEnemies
        {
            get { return activeEnemies.Count; }
        }

        public void StartStage(StageDefinition stage, Transform player)
        {
            StopStage();
            currentStage = stage;
            playerTarget = player;
            spawnRoutine = StartCoroutine(RunStage());
        }

        public void StopStage()
        {
            if (spawnRoutine != null)
            {
                StopCoroutine(spawnRoutine);
                spawnRoutine = null;
            }

            for (int i = activeEnemies.Count - 1; i >= 0; i--)
            {
                TankRuntimeBinder enemy = activeEnemies[i];
                if (enemy != null)
                {
                    Destroy(enemy.gameObject);
                }
            }

            activeEnemies.Clear();
        }

        private IEnumerator RunStage()
        {
            if (currentStage == null)
            {
                yield break;
            }

            if (currentStage.waves == null || currentStage.waves.Count == 0)
            {
                currentStage.waves = new List<EnemyWaveDefinition>();
                currentStage.waves.Add(new EnemyWaveDefinition());
            }

            for (int waveIndex = 0; waveIndex < currentStage.waves.Count; waveIndex++)
            {
                EnemyWaveDefinition wave = currentStage.waves[waveIndex];
                for (int i = 0; i < wave.count; i++)
                {
                    SpawnEnemy(wave, waveIndex, i);
                    yield return new WaitForSeconds(wave.spawnInterval);
                }

                yield return new WaitForSeconds(0.5f);
            }

            yield return new WaitUntil(() => activeEnemies.Count == 0);

            StageCompleted?.Invoke(currentStage);
            spawnRoutine = null;
        }

        private void SpawnEnemy(EnemyWaveDefinition wave, int waveIndex, int spawnIndex)
        {
            Vector3 spawnPosition = PickSpawnPosition(waveIndex, spawnIndex);
            TankStats stats = BuiltInContentFactory.CreateEnemyStats(wave.archetype, currentStage != null ? currentStage.stageIndex : 1, wave);
            Color color = PickColor(wave.archetype);

            TankRuntimeBinder enemy = RuntimeFactory.CreateTank(
                wave.archetype.ToString() + "_" + waveIndex + "_" + spawnIndex,
                spawnPosition,
                TeamKind.Enemy,
                color,
                stats);

            EnemyTankAI ai = enemy.gameObject.AddComponent<EnemyTankAI>();
            ai.Initialize(playerTarget, wave.archetype, stats);

            Health health = enemy.Health;
            if (health != null)
            {
                health.Died += HandleEnemyDied;
            }

            activeEnemies.Add(enemy);
        }

        private void HandleEnemyDied(Health health)
        {
            if (health == null)
            {
                return;
            }

            TankRuntimeBinder binder = health.GetComponent<TankRuntimeBinder>();
            if (binder != null)
            {
                activeEnemies.Remove(binder);
            }
            else
            {
                for (int i = activeEnemies.Count - 1; i >= 0; i--)
                {
                    if (activeEnemies[i] == null)
                    {
                        activeEnemies.RemoveAt(i);
                    }
                }
            }
        }

        private Vector3 PickSpawnPosition(int waveIndex, int spawnIndex)
        {
            float angle = ((waveIndex * 37) + (spawnIndex * 83)) % 360f;
            float radius = Mathf.Clamp(spawnRadius + waveIndex * 0.5f, 8f, spawnRadius + 3f);
            Vector3 offset = Quaternion.Euler(0f, angle, 0f) * Vector3.forward * radius;
            Vector3 position = offset;
            position.y = 0.5f;
            if (ArenaBounds.Instance != null)
            {
                Vector3 clamped = ArenaBounds.Instance.Clamp(position);
                clamped.x = Mathf.Clamp(clamped.x, -ArenaBounds.Instance.HalfExtents.x + arenaPadding, ArenaBounds.Instance.HalfExtents.x - arenaPadding);
                clamped.z = Mathf.Clamp(clamped.z, -ArenaBounds.Instance.HalfExtents.y + arenaPadding, ArenaBounds.Instance.HalfExtents.y - arenaPadding);
                return clamped;
            }

            return position;
        }

        private Color PickColor(EnemyArchetype archetype)
        {
            switch (archetype)
            {
                case EnemyArchetype.Striker:
                    return new Color(0.91f, 0.46f, 0.18f, 1f);
                case EnemyArchetype.Sniper:
                    return new Color(0.72f, 0.3f, 0.9f, 1f);
                case EnemyArchetype.Boss:
                    return new Color(0.84f, 0.16f, 0.2f, 1f);
                default:
                    return new Color(0.88f, 0.84f, 0.28f, 1f);
            }
        }
    }
}
