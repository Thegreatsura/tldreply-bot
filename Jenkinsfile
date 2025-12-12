
pipeline {
    agent any

    environment {
       
       PATH = "${env.PATH}:./node_modules/.bin"
        
        NODE_ENV = "production"
        PM2_APP_NAME = "trlreply-bot" // Use the name from your environment variables
    }

    stages {
        
        stage('📦 Install Dependencies') {
            steps {
                echo '⬇️ Checking out source code and installing dependencies...'
                sh 'npm ci' 
            }
        }

        stage('🧪 Lint, Format, & Test (Parallel)') {
            parallel {
                
                stage('Lint Check') {
                    steps {
                        echo '🧹 Running ESLint for code quality...'
                        sh 'npm run lint' 
                    }
                }
                
                stage('Format Check') {
                    steps {
                        echo '✨ Running Prettier for code formatting...'
                        sh 'npm run format:check' 
                    }
                }
                
                stage('Unit Tests') {
                    steps {
                        echo '🔬 Running unit and integration tests...'
                        sh 'npm run test' 
                    }
                }
            }
        }

        stage('🔨 Build Application') {
            steps {
                echo '🛠️ Compiling TypeScript to JavaScript...'
                sh 'npm run build' 
            }
        }

        stage('🚀 Deploy with PM2') {
            steps {
                echo "☁️ Preparing deployment for application: ${env.PM2_APP_NAME}"

                sh '''
                    echo "Checking existing PM2 processes..."
                    pm2 describe $PM2_APP_NAME > /dev/null 2>&1
                    
                    if [ $? -eq 0 ]; then
                        echo "Found old process. Deleting..."
                        pm2 delete $PM2_APP_NAME
                    else
                        echo "No existing process found."
                    fi
                '''

                sh '''
                    echo "Starting new build and saving state..."
                    pm2 start dist/index.js --name $PM2_APP_NAME
                    pm2 save
                    echo "Application deployed and PM2 state saved."
                '''
            }
        }
    }

    post {
        always {
            echo '🧹 Cleaning up workspace...' 
            cleanWs() 
        }
        success {
            echo '🎉 SUCCESS! Pipeline completed successfully!'
        }
        failure {
            echo '❌ FAILED! Check the logs for errors.'
        }
    }
}