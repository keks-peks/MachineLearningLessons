// Подключаем необходимые модули
const $ = require('jquery')
const synaptic = require('synaptic')
const Matter = require('matter-js/build/matter')

$(document).ready(function () {
  // Объявляем механизм обучения и построения архитектуры нейронной сети
  let Trainer = synaptic.Trainer
  let Architect = synaptic.Architect

  // Объявляем элементы физического 2D движка
  let Body = Matter.Body
  let World = Matter.World
  let Engine = Matter.Engine
  let Runner = Matter.Runner
  let Render = Matter.Render
  let Bodies = Matter.Bodies
  let Events = Matter.Events

  let runner = Runner.create()
  let engine = Engine.create()

  // Определяем размеры окна рендера
  let renderBox = $('#render-box')
  let renderBoxWidth = renderBox.width()
  let renderBoxHeight = 600

  // Создаем рендер с параметрами
  let render = Render.create({
    element: renderBox[0],
    engine: engine,
    options: {
      width: renderBoxWidth,
      height: renderBoxHeight,
      showVelocity: true
    }
  });

  // Строим нейронную сеть 4(входа)-32(скрытых нейрона)-1(выход)
  let network = new Architect.Perceptron(4, 32, 1)
  let trainer = new Trainer(network)
  let trainingSet = []
  let justPredicted = null

  // Определяем начальные параметры шарика
  let initialJumpDistance = 0
  let initialJumpPower = 0
  let initialBoxWidth = 0
  let initialBoxHeight = 0
  let initialPosition = 50

  // Шарик уже прыгнул?
  let alreadyJumped = false

  // Количество неудачных и успешных прожков
  let failCount = 0
  let successCount = 0

  // Нейронная сеть работает?
  let annIsActive = false

  // Объявляем поверхность, препятствие, шарик
  let ground
  let box
  let ball

  // Функция ренерирования случайного числа [min, max]
  function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Нормализуем данные, переведем на интервал [0, 1]
  function normalizeData() {
    initialBoxWidth /= 500
    initialBoxHeight /= 500
    initialJumpPower /= 30
    initialJumpDistance /= (renderBoxWidth / 2)
  }

  // Денормализуем данные, восстановим оригинальные значения
  function deNormalizeData() {
    initialBoxWidth *= 500
    initialBoxHeight *= 500
    initialJumpPower *= 30
    initialJumpDistance *= (renderBoxWidth / 2)
  }

  // Обучаем нейронную сеть порциями по 10 наборов
  function trainNetwork() {
    if (!annIsActive) {
      if (trainingSet.length >= 10) {
        let error = trainer.train(trainingSet, { iterations: 10, shuffle: true, cost: Trainer.cost.MSE }).error
        trainingSet = []
        $('#alrError').text('Error: ' + (error).toFixed(6))
      }
    }
  }

  // Генерируем случайные начальные параметры системы или
  // используем значения предсказанные нейронной сетью
  function generateInitialValues() {
    // Случайная ширина и высота препятствия
    initialBoxWidth = getRandomArbitrary(50, 500)
    initialBoxHeight = getRandomArbitrary(50, 500)

    // Если нейронная сеть не активна
    if (!annIsActive) {
      // То определяем параметры случайным образом
      initialJumpPower = getRandomArbitrary(1, 20)
      initialJumpDistance = getRandomArbitrary(50, renderBoxWidth / 2)
    } else {
      // А если нейронная сеть активна, то для всего диапазона возможных значений
      // получаем ответ от нейронной сети
      let predicted = []

      // j - сила прыжка шара, k - дистанция до припятствия
      for (let j = 1; j <= 30; j+=1) {
        for (let k = 50; k <= renderBoxWidth / 2; k+=1) {
          initialJumpPower = j
          initialJumpDistance = k
          // Получаем ответ от нейронной сети
          normalizeData()
          justPredicted = network.activate([initialJumpPower, initialJumpDistance, initialBoxWidth, initialBoxHeight])[0]
          deNormalizeData()
          // И сохраняем его в массив
          // [Оценка успешности прыжка, сила прыжка, дистанция до препятствия, ширина препятствия, высота препятствия]
          predicted.push([justPredicted, initialJumpPower, initialJumpDistance, initialBoxWidth, initialBoxHeight])
        }
      }

      // Отсеиваем все варианты с вероятностью успеха > 95%
      predicted = predicted.filter(function (item) {
        return item[0] > 0.95
      })

      // Сортируем по возрастанию силы прыжка шара
      predicted = predicted.sort(function (a, b) {
        return a[1] - b[1]
      })

      // Выбыраем первый элемент из этого списка (с наименьшей силой прыжка шара)
      predicted = predicted[0]

      // Если есть такое значение
      if (predicted) {
        // Устанавливаем параметры, предсказанные нейронной сетью
        initialJumpPower = predicted[1]
        initialJumpDistance = predicted[2]
      } else {
        // Если сеть не дала ответа с успешным исходом то сбрасываем значения
        initialJumpPower = 0
        initialJumpDistance = 0
      }
    }

    // Получаем значение вероятности успешного прыжка
    normalizeData()
    justPredicted = network.activate([initialJumpPower, initialJumpDistance, initialBoxWidth, initialBoxHeight])[0]
    deNormalizeData()

    // Устанавливаем что шар еще не прыгал
    alreadyJumped = false

    // Создаем новую поверхность, препятствие, шар
    ground = Bodies.rectangle(renderBoxWidth / 2, renderBoxHeight - 10, renderBoxWidth, 20, { isStatic: true })
    box = Bodies.rectangle(0, 0, initialBoxWidth, initialBoxHeight, { isStatic: true } )
    ball = Bodies.circle(0, 0, 25, { restitution: 1 })

    // Устанавливаем позиуии шара и препятствия относительно центра области рендера
    Body.setPosition(box, {x: renderBoxWidth / 2, y: renderBoxHeight - initialBoxHeight / 2 - 20})
    Body.setPosition(ball, {x: initialPosition, y: renderBoxHeight - 25 - 20})

    // Удаляем старую поверхность, препятствие, шар
    World.clear(engine.world, false)
    // Добавляем новую поверхность, препятствие, шар
    World.add(engine.world, [box, ball, ground])
  }

  // Функция прыжка шара
  function jump() {
    if (!alreadyJumped) {
      // Задаем отрицательную скорость, чтобы шар оттолкнулся от поверхности
      Body.setVelocity(ball, {x: ball.velocity.x, y: -initialJumpPower})
      // Устанавливаем что шар уже прыгнул
      alreadyJumped = true
    }
  }

  // Выполняем при успешном прыжке
  function success() {
    if (!annIsActive)
      successCount += 1

    if (justPredicted > 0.5)
      $('#alrResult').removeClass('alert-danger').addClass('alert-success').text('№' +
        (failCount + successCount) + ' Pred: ' + justPredicted + ' Real: 1')
    else
      $('#alrResult').removeClass('alert-success').addClass('alert-danger').text('№' +
        (failCount + successCount) + ' Pred: ' + justPredicted + ' Real: 1')

    // Нормализуем данные и сохраняем их в переменную data
    // output: [1] - для успешного прыжка
    normalizeData()
    let data = {
      input: [initialJumpPower, initialJumpDistance, initialBoxWidth, initialBoxHeight],
      output: [1]
    }
    deNormalizeData()

    // Если сеть не обучается, то добавляем данные для обучения в массив trainingSet
    if (!annIsActive)
      trainingSet.push(data)

    // Тренеруем сеть и занова генерируем начальные параметры для следующей попытки
    trainNetwork()
    generateInitialValues()
  }

  // Выполняем при неудачном прыжке
  function fail() {
    if (!annIsActive)
      failCount += 1

    if (justPredicted < 0.5)
      $('#alrResult').removeClass('alert-danger').addClass('alert-success').text('№' +
        (failCount + successCount) + ' Pred: ' + justPredicted + ' Real: 0')
    else
      $('#alrResult').removeClass('alert-success').addClass('alert-danger').text('№' +
        (failCount + successCount) + ' Pred: ' + justPredicted + ' Real: 0')

    // Нормализуем данные и сохраняем их в переменную data
    // output: [0] - для неудачного прыжка
    normalizeData()
    let data = {
      input: [initialJumpPower, initialJumpDistance, initialBoxWidth, initialBoxHeight],
      output: [0]
    }
    deNormalizeData()

    // Если сеть не обучается, то добавляем данные для обучения в массив trainingSet
    if (!annIsActive)
      trainingSet.push(data)

    // Тренеруем сеть и занова генерируем начальные параметры для следующей попытки
    trainNetwork()
    generateInitialValues()
  }

  // Генерируем начальные значения для самого первого прыжка
  generateInitialValues()

  // Запускаем отображение объектов
  Render.run(render);

  // Функция срабатывает перед каждой итерацией просчета физики
  Events.on(engine, 'beforeUpdate', function(event) {
    // Устанавливаем постоянную скорость движения шара = 5
    Body.setVelocity(ball, {x: 5, y: ball.velocity.y})

    // Если шар вышел за границу области слева
    if (ball.position.x < 0)
      fail()

    // Если шар вышел за границу области справа
    if (ball.position.x >= renderBoxWidth)
      success()

    // Если расстояние до препятствия меньше заданного, то шар прыгает
    if (Math.abs(box.position.x - initialBoxWidth - ball.position.x) <= initialJumpDistance)
      jump()
  });

  // Обрабатываем события столкновений шара и препятствия, шара и поверхности
  Events.on(engine, 'collisionStart collisionActive', function(event) {
    let pair = event.pairs[0];

    if (pair.bodyA === box && pair.bodyB === ball) {
      if (ball.position.y > box.position.y - initialBoxHeight / 2) {
        fail()
      }
    }

    if (pair.bodyA === ground && pair.bodyB === ball) {
      if (alreadyJumped) {
        if (ball.position.x > box.position.x) {
          success()
        } else {
          fail()
        }
      }
    }
  });

  // Обработчики событий интерфейса
  $('#btnStart').click(function (event) {
    Runner.start(runner, engine)
  })

  $('#btnPause').click(function () {
    Runner.stop(runner, engine)
  })

  $('#btnRefresh').click(function () {
    generateInitialValues()
  })

  $('#btnToogleANN').click(function () {
    $(this).toggleClass('btn-danger')
    $(this).toggleClass('btn-success')

    annIsActive = $(this).hasClass('btn-success')
  })
})